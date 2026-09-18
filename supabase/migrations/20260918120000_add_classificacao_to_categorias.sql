-- Classificação de categorias e subcategorias (receita / despesa / ambos).
-- A classificação só decide quais opções aparecem nas telas de cadastro.
-- Nenhum lançamento existente (despesas, receitas, itens_fatura, metas) é alterado.

ALTER TABLE public.categorias
ADD COLUMN IF NOT EXISTS classificacao TEXT NOT NULL DEFAULT 'ambos';

ALTER TABLE public.subcategorias
ADD COLUMN IF NOT EXISTS classificacao TEXT NOT NULL DEFAULT 'ambos';

-- Garantia extra: registros existentes ficam como 'ambos'.
UPDATE public.categorias
SET classificacao = 'ambos'
WHERE classificacao IS NULL;

UPDATE public.subcategorias
SET classificacao = 'ambos'
WHERE classificacao IS NULL;

ALTER TABLE public.categorias
DROP CONSTRAINT IF EXISTS categorias_classificacao_check;

ALTER TABLE public.categorias
ADD CONSTRAINT categorias_classificacao_check
CHECK (classificacao IN ('receita', 'despesa', 'ambos'));

ALTER TABLE public.subcategorias
DROP CONSTRAINT IF EXISTS subcategorias_classificacao_check;

ALTER TABLE public.subcategorias
ADD CONSTRAINT subcategorias_classificacao_check
CHECK (classificacao IN ('receita', 'despesa', 'ambos'));

CREATE INDEX IF NOT EXISTS idx_categorias_usuario_classificacao
ON public.categorias (usuario_id, classificacao);

CREATE INDEX IF NOT EXISTS idx_subcategorias_usuario_classificacao
ON public.subcategorias (usuario_id, classificacao);
