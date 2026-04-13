ALTER TABLE public.itens_fatura
ADD COLUMN IF NOT EXISTS descricao_original TEXT,
ADD COLUMN IF NOT EXISTS descricao_normalizada TEXT,
ADD COLUMN IF NOT EXISTS parcelas TEXT,
ADD COLUMN IF NOT EXISTS data_compra DATE,
ADD COLUMN IF NOT EXISTS banco_origem TEXT,
ADD COLUMN IF NOT EXISTS observacao_parser TEXT,
ADD COLUMN IF NOT EXISTS categoria_sugerida_id UUID REFERENCES public.categorias(id),
ADD COLUMN IF NOT EXISTS subcategoria_sugerida_id UUID REFERENCES public.subcategorias(id),
ADD COLUMN IF NOT EXISTS sugestao_origem TEXT,
ADD COLUMN IF NOT EXISTS sugestao_confianca NUMERIC(5,2),
ADD COLUMN IF NOT EXISTS recorrente BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS importado_pdf BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

UPDATE public.itens_fatura
SET parcelas = CASE
  WHEN parcela_atual IS NOT NULL AND total_parcelas IS NOT NULL THEN parcela_atual::text || '/' || total_parcelas::text
  ELSE NULL
END
WHERE parcelas IS NULL;

CREATE TABLE IF NOT EXISTS public.categorias_sugeridas_cartao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cartao_id UUID REFERENCES public.contas(id) ON DELETE CASCADE NOT NULL,
  descricao_normalizada TEXT NOT NULL,
  categoria TEXT,
  categoria_id UUID REFERENCES public.categorias(id),
  subcategoria_id UUID REFERENCES public.subcategorias(id),
  quantidade_uso INTEGER NOT NULL DEFAULT 1,
  ultima_data_uso DATE,
  recorrente BOOLEAN NOT NULL DEFAULT false,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.categorias_sugeridas_cartao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own categorias_sugeridas_cartao SELECT"
  ON public.categorias_sugeridas_cartao FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias_sugeridas_cartao INSERT"
  ON public.categorias_sugeridas_cartao FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias_sugeridas_cartao UPDATE"
  ON public.categorias_sugeridas_cartao FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias_sugeridas_cartao DELETE"
  ON public.categorias_sugeridas_cartao FOR DELETE USING (auth.uid() = usuario_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_categorias_sugeridas_cartao_unique
  ON public.categorias_sugeridas_cartao(usuario_id, cartao_id, descricao_normalizada);
CREATE INDEX IF NOT EXISTS idx_categorias_sugeridas_cartao_lookup
  ON public.categorias_sugeridas_cartao(usuario_id, cartao_id, quantidade_uso DESC, ultima_data_uso DESC);

CREATE TABLE IF NOT EXISTS public.importacoes_fatura_pdf (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  cartao_id UUID REFERENCES public.contas(id) ON DELETE CASCADE NOT NULL,
  fatura_id UUID REFERENCES public.faturas_cartao(id) ON DELETE SET NULL,
  banco_origem TEXT,
  nome_arquivo TEXT NOT NULL,
  competencia TEXT NOT NULL,
  vencimento DATE NOT NULL,
  total_itens_extraidos INTEGER NOT NULL DEFAULT 0,
  total_importado NUMERIC(12,2) NOT NULL DEFAULT 0,
  itens_sugeridos INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'processando',
  mensagem_erro TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.importacoes_fatura_pdf ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own importacoes_fatura_pdf SELECT"
  ON public.importacoes_fatura_pdf FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own importacoes_fatura_pdf INSERT"
  ON public.importacoes_fatura_pdf FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own importacoes_fatura_pdf UPDATE"
  ON public.importacoes_fatura_pdf FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own importacoes_fatura_pdf DELETE"
  ON public.importacoes_fatura_pdf FOR DELETE USING (auth.uid() = usuario_id);

CREATE INDEX IF NOT EXISTS idx_importacoes_fatura_pdf_usuario_comp
  ON public.importacoes_fatura_pdf(usuario_id, cartao_id, competencia, criado_em DESC);

CREATE OR REPLACE FUNCTION public.sync_item_parcelas()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parcela_match TEXT[];
BEGIN
  IF NEW.parcelas IS NULL AND NEW.parcela_atual IS NOT NULL AND NEW.total_parcelas IS NOT NULL THEN
    NEW.parcelas := NEW.parcela_atual::text || '/' || NEW.total_parcelas::text;
  END IF;

  IF NEW.parcelas IS NOT NULL THEN
    parcela_match := regexp_match(NEW.parcelas, '^([0-9]{1,2})/([0-9]{1,2})$');
    IF parcela_match IS NOT NULL THEN
      NEW.parcela_atual := parcela_match[1]::INTEGER;
      NEW.total_parcelas := parcela_match[2]::INTEGER;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_item_parcelas_before_write ON public.itens_fatura;
CREATE TRIGGER sync_item_parcelas_before_write
BEFORE INSERT OR UPDATE ON public.itens_fatura
FOR EACH ROW
EXECUTE FUNCTION public.sync_item_parcelas();

CREATE OR REPLACE FUNCTION public.update_importacao_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_itens_fatura_updated_at ON public.itens_fatura;
CREATE TRIGGER update_itens_fatura_updated_at
BEFORE UPDATE ON public.itens_fatura
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_categorias_sugeridas_cartao_updated_at ON public.categorias_sugeridas_cartao;
CREATE TRIGGER update_categorias_sugeridas_cartao_updated_at
BEFORE UPDATE ON public.categorias_sugeridas_cartao
FOR EACH ROW
EXECUTE FUNCTION public.update_importacao_updated_at_column();

DROP TRIGGER IF EXISTS update_importacoes_fatura_pdf_updated_at ON public.importacoes_fatura_pdf;
CREATE TRIGGER update_importacoes_fatura_pdf_updated_at
BEFORE UPDATE ON public.importacoes_fatura_pdf
FOR EACH ROW
EXECUTE FUNCTION public.update_importacao_updated_at_column();
