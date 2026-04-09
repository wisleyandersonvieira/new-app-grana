
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome TEXT,
  email TEXT,
  ultimo_acesso TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Assinaturas
CREATE TABLE public.assinaturas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'trial',
  trial_inicio TIMESTAMP WITH TIME ZONE DEFAULT now(),
  trial_fim TIMESTAMP WITH TIME ZONE DEFAULT (now() + interval '7 days'),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plano TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own subscription" ON public.assinaturas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users insert own subscription" ON public.assinaturas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users update own subscription" ON public.assinaturas FOR UPDATE USING (auth.uid() = usuario_id);

-- Contas
CREATE TABLE public.contas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'corrente',
  saldo_inicial NUMERIC(12,2) DEFAULT 0,
  data_saldo_inicial DATE DEFAULT CURRENT_DATE,
  bloqueada BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own contas SELECT" ON public.contas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own contas INSERT" ON public.contas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own contas UPDATE" ON public.contas FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own contas DELETE" ON public.contas FOR DELETE USING (auth.uid() = usuario_id);

-- Categorias
CREATE TABLE public.categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  bloqueada BOOLEAN DEFAULT false,
  obrigatoria BOOLEAN DEFAULT false,
  categoria_padrao BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own categorias SELECT" ON public.categorias FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias INSERT" ON public.categorias FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias UPDATE" ON public.categorias FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias DELETE" ON public.categorias FOR DELETE USING (auth.uid() = usuario_id);

-- Subcategorias
CREATE TABLE public.subcategorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id UUID REFERENCES public.categorias(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  nome TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.subcategorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own subcategorias SELECT" ON public.subcategorias FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own subcategorias INSERT" ON public.subcategorias FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own subcategorias UPDATE" ON public.subcategorias FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own subcategorias DELETE" ON public.subcategorias FOR DELETE USING (auth.uid() = usuario_id);

-- Receitas
CREATE TABLE public.receitas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  competencia DATE,
  data_pagamento DATE,
  conta_id UUID REFERENCES public.contas(id),
  categoria_id UUID REFERENCES public.categorias(id),
  subcategoria_id UUID REFERENCES public.subcategorias(id),
  status TEXT DEFAULT 'pendente',
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own receitas SELECT" ON public.receitas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own receitas INSERT" ON public.receitas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own receitas UPDATE" ON public.receitas FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own receitas DELETE" ON public.receitas FOR DELETE USING (auth.uid() = usuario_id);

-- Despesas
CREATE TABLE public.despesas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  competencia DATE,
  data_pagamento DATE,
  conta_id UUID REFERENCES public.contas(id),
  categoria_id UUID REFERENCES public.categorias(id),
  subcategoria_id UUID REFERENCES public.subcategorias(id),
  status TEXT DEFAULT 'pendente',
  observacao TEXT,
  parcela_atual INTEGER,
  total_parcelas INTEGER,
  despesa_pai_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own despesas SELECT" ON public.despesas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own despesas INSERT" ON public.despesas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own despesas UPDATE" ON public.despesas FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own despesas DELETE" ON public.despesas FOR DELETE USING (auth.uid() = usuario_id);

-- Transferencias
CREATE TABLE public.transferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conta_origem_id UUID REFERENCES public.contas(id),
  conta_destino_id UUID REFERENCES public.contas(id),
  valor NUMERIC(12,2) NOT NULL,
  data DATE DEFAULT CURRENT_DATE,
  observacao TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.transferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own transferencias SELECT" ON public.transferencias FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own transferencias INSERT" ON public.transferencias FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own transferencias UPDATE" ON public.transferencias FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own transferencias DELETE" ON public.transferencias FOR DELETE USING (auth.uid() = usuario_id);

-- Faturas Cartao
CREATE TABLE public.faturas_cartao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  conta_id UUID REFERENCES public.contas(id),
  mes_ano TEXT NOT NULL,
  status TEXT DEFAULT 'aberta',
  valor_total NUMERIC(12,2) DEFAULT 0,
  data_vencimento DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.faturas_cartao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own faturas SELECT" ON public.faturas_cartao FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own faturas INSERT" ON public.faturas_cartao FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own faturas UPDATE" ON public.faturas_cartao FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own faturas DELETE" ON public.faturas_cartao FOR DELETE USING (auth.uid() = usuario_id);

-- Itens Fatura
CREATE TABLE public.itens_fatura (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fatura_id UUID REFERENCES public.faturas_cartao(id) ON DELETE CASCADE NOT NULL,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  descricao TEXT NOT NULL,
  valor NUMERIC(12,2) NOT NULL,
  categoria_id UUID REFERENCES public.categorias(id),
  subcategoria_id UUID REFERENCES public.subcategorias(id),
  data DATE,
  competencia DATE,
  parcela_atual INTEGER,
  total_parcelas INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.itens_fatura ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own itens_fatura SELECT" ON public.itens_fatura FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own itens_fatura INSERT" ON public.itens_fatura FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own itens_fatura UPDATE" ON public.itens_fatura FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own itens_fatura DELETE" ON public.itens_fatura FOR DELETE USING (auth.uid() = usuario_id);

-- Metas
CREATE TABLE public.metas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  categoria_id UUID REFERENCES public.categorias(id),
  valor NUMERIC(12,2) NOT NULL,
  mes_ano TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own metas SELECT" ON public.metas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own metas INSERT" ON public.metas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own metas UPDATE" ON public.metas FOR UPDATE USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own metas DELETE" ON public.metas FOR DELETE USING (auth.uid() = usuario_id);

-- Bloqueios
CREATE TABLE public.bloqueios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  mes_ano TEXT NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'competencia',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bloqueios SELECT" ON public.bloqueios FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own bloqueios INSERT" ON public.bloqueios FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own bloqueios DELETE" ON public.bloqueios FOR DELETE USING (auth.uid() = usuario_id);

-- Indexes
CREATE INDEX idx_receitas_usuario ON public.receitas(usuario_id);
CREATE INDEX idx_receitas_competencia ON public.receitas(competencia);
CREATE INDEX idx_despesas_usuario ON public.despesas(usuario_id);
CREATE INDEX idx_despesas_competencia ON public.despesas(competencia);
CREATE INDEX idx_itens_fatura_fatura ON public.itens_fatura(fatura_id);
CREATE INDEX idx_metas_usuario ON public.metas(usuario_id);
CREATE INDEX idx_categorias_usuario ON public.categorias(usuario_id);
CREATE INDEX idx_contas_usuario ON public.contas(usuario_id);

-- Trigger for new user: create profile + trial subscription
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO public.assinaturas (usuario_id, status, trial_inicio, trial_fim)
  VALUES (NEW.id, 'trial', now(), now() + interval '7 days');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_assinaturas_updated_at BEFORE UPDATE ON public.assinaturas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_contas_updated_at BEFORE UPDATE ON public.contas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_receitas_updated_at BEFORE UPDATE ON public.receitas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_despesas_updated_at BEFORE UPDATE ON public.despesas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_faturas_updated_at BEFORE UPDATE ON public.faturas_cartao FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
