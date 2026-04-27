ALTER TABLE public.metas
ADD COLUMN IF NOT EXISTS natureza TEXT;

UPDATE public.metas
SET natureza = CASE
  WHEN tipo = 'receita' THEN 'receita'
  ELSE 'despesa'
END
WHERE natureza IS NULL;

ALTER TABLE public.metas
DROP CONSTRAINT IF EXISTS metas_natureza_check;

ALTER TABLE public.metas
ADD CONSTRAINT metas_natureza_check
CHECK (natureza IS NULL OR natureza IN ('receita', 'despesa'));

CREATE INDEX IF NOT EXISTS idx_metas_usuario_mes_tipo_natureza
ON public.metas (usuario_id, mes_ano, tipo, natureza);
