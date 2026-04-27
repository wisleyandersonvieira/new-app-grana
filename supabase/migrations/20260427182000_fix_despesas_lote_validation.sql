-- Permite que despesas usem lote_id como agrupador interno sem tratar todo UUID como fatura.
-- Se o lote_id corresponder a uma fatura existente, ela ainda precisa pertencer ao usuario.

CREATE OR REPLACE FUNCTION public.assert_owned_existing_fatura_lote(
  p_usuario_id UUID,
  p_lote_id TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fatura_id UUID;
BEGIN
  v_fatura_id := public.try_uuid(p_lote_id);

  IF v_fatura_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
      SELECT 1
      FROM public.faturas_cartao
      WHERE id = v_fatura_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.faturas_cartao
      WHERE id = v_fatura_id
        AND usuario_id = p_usuario_id
    )
  THEN
    RAISE EXCEPTION 'Invalid invoice reference';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_despesas_owner_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_owned_conta(NEW.usuario_id, NEW.conta_id);
  PERFORM public.assert_owned_categoria(NEW.usuario_id, NEW.categoria_id);
  PERFORM public.assert_owned_subcategoria(NEW.usuario_id, NEW.subcategoria_id, NEW.categoria_id);
  PERFORM public.assert_owned_despesa(NEW.usuario_id, NEW.despesa_pai_id);
  PERFORM public.assert_owned_existing_fatura_lote(NEW.usuario_id, NEW.lote_id);
  RETURN NEW;
END;
$$;
