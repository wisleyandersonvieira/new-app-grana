
-- profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- despesas: alter competencia from DATE to TEXT, add missing columns
ALTER TABLE public.despesas ALTER COLUMN competencia TYPE TEXT USING to_char(competencia, 'YYYY-MM');
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS data DATE;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS paga BOOLEAN DEFAULT false;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS lote_id TEXT;
ALTER TABLE public.despesas ADD COLUMN IF NOT EXISTS parcela INTEGER;

-- receitas: alter competencia from DATE to TEXT, add missing columns
ALTER TABLE public.receitas ALTER COLUMN competencia TYPE TEXT USING to_char(competencia, 'YYYY-MM');
ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS data DATE;
ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS paga BOOLEAN DEFAULT false;
ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS lote_id TEXT;
ALTER TABLE public.receitas ADD COLUMN IF NOT EXISTS parcela INTEGER;

-- metas
ALTER TABLE public.metas ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'despesa';

-- subcategorias
ALTER TABLE public.subcategorias ADD COLUMN IF NOT EXISTS bloqueada BOOLEAN DEFAULT false;
ALTER TABLE public.subcategorias ADD COLUMN IF NOT EXISTS obrigatoria BOOLEAN DEFAULT false;
ALTER TABLE public.subcategorias ADD COLUMN IF NOT EXISTS subcategoria_padrao BOOLEAN DEFAULT false;

-- faturas_cartao
ALTER TABLE public.faturas_cartao ADD COLUMN IF NOT EXISTS observacao TEXT;

-- indexes for new columns
CREATE INDEX IF NOT EXISTS idx_despesas_paga ON public.despesas(paga);
CREATE INDEX IF NOT EXISTS idx_despesas_lote ON public.despesas(lote_id);
CREATE INDEX IF NOT EXISTS idx_receitas_paga ON public.receitas(paga);
CREATE INDEX IF NOT EXISTS idx_receitas_lote ON public.receitas(lote_id);
