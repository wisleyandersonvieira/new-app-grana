
-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  is_admin BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  ultimo_acesso TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nome)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Categorias
CREATE TABLE public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  bloqueada BOOLEAN DEFAULT false,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria_padrao BOOLEAN DEFAULT false,
  obrigatoria BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own categorias" ON public.categorias FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);

-- Subcategorias
CREATE TABLE public.subcategorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  categoria_id UUID NOT NULL REFERENCES public.categorias(id) ON DELETE CASCADE,
  bloqueada BOOLEAN DEFAULT false,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subcategoria_padrao BOOLEAN DEFAULT false,
  obrigatoria BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.subcategorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own subcategorias" ON public.subcategorias FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);

-- Contas
CREATE TABLE public.contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('conta', 'cartao')),
  saldo_inicial REAL DEFAULT 0.0,
  data_saldo_inicial DATE,
  bloqueada BOOLEAN DEFAULT false,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contas" ON public.contas FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);

-- Despesas
CREATE TABLE public.despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID REFERENCES public.categorias(id),
  subcategoria_id UUID REFERENCES public.subcategorias(id),
  descricao TEXT,
  valor REAL NOT NULL,
  data DATE NOT NULL,
  competencia TEXT,
  conta_id UUID REFERENCES public.contas(id),
  parcela INTEGER,
  lote_id UUID,
  paga BOOLEAN DEFAULT false,
  data_pagamento DATE,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own despesas" ON public.despesas FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);

-- Receitas
CREATE TABLE public.receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID REFERENCES public.categorias(id),
  subcategoria_id UUID REFERENCES public.subcategorias(id),
  descricao TEXT,
  valor REAL NOT NULL,
  data DATE NOT NULL,
  competencia TEXT,
  conta_id UUID REFERENCES public.contas(id),
  parcela INTEGER,
  lote_id UUID,
  paga BOOLEAN DEFAULT false,
  data_pagamento DATE,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own receitas" ON public.receitas FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);

-- Faturas cartão
CREATE TABLE public.faturas_cartao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cartao_id UUID NOT NULL REFERENCES public.contas(id),
  competencia TEXT NOT NULL,
  vencimento DATE NOT NULL,
  conta_id UUID REFERENCES public.contas(id),
  observacao TEXT,
  valor_total REAL,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.faturas_cartao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own faturas" ON public.faturas_cartao FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);

-- Itens fatura
CREATE TABLE public.itens_fatura (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id UUID NOT NULL REFERENCES public.faturas_cartao(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES public.categorias(id),
  subcategoria_id UUID REFERENCES public.subcategorias(id),
  descricao TEXT,
  valor REAL NOT NULL,
  data DATE,
  competencia TEXT,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.itens_fatura ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own itens_fatura" ON public.itens_fatura FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);

-- Transferências
CREATE TABLE public.transferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data DATE NOT NULL,
  conta_origem_id UUID NOT NULL REFERENCES public.contas(id),
  conta_destino_id UUID NOT NULL REFERENCES public.contas(id),
  valor REAL NOT NULL,
  observacao TEXT,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.transferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transferencias" ON public.transferencias FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);

-- Bloqueios
CREATE TABLE public.bloqueios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('competencia', 'pagamento')),
  mes_ano TEXT NOT NULL,
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bloqueios" ON public.bloqueios FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);

-- Metas
CREATE TABLE public.metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  competencia TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('receita', 'despesa', 'categoria')),
  categoria_id UUID REFERENCES public.categorias(id),
  valor REAL NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(usuario_id, competencia, tipo, categoria_id)
);

ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own metas" ON public.metas FOR ALL USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
