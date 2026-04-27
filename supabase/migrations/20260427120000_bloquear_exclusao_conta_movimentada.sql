CREATE OR REPLACE FUNCTION public.conta_reference_exists(p_table_name TEXT, p_column_name TEXT, p_conta_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  exists_result BOOLEAN := false;
BEGIN
  IF to_regclass('public.' || p_table_name) IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  ) THEN
    RETURN false;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE %I = $1 LIMIT 1)', p_table_name, p_column_name)
    INTO exists_result
    USING p_conta_id;

  RETURN exists_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_delete_conta_with_movements()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF public.conta_reference_exists('despesas', 'conta_id', OLD.id)
    OR public.conta_reference_exists('receitas', 'conta_id', OLD.id)
    OR public.conta_reference_exists('transferencias', 'conta_origem_id', OLD.id)
    OR public.conta_reference_exists('transferencias', 'conta_destino_id', OLD.id)
    OR public.conta_reference_exists('faturas_cartao', 'conta_id', OLD.id)
    OR public.conta_reference_exists('faturas_cartao', 'cartao_id', OLD.id)
    OR public.conta_reference_exists('categorias_sugeridas_cartao', 'cartao_id', OLD.id)
    OR public.conta_reference_exists('importacoes_fatura_pdf', 'cartao_id', OLD.id)
  THEN
    RAISE EXCEPTION 'Esta conta não pode ser excluída porque possui movimentações cadastradas.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS prevent_delete_conta_with_movements_trigger ON public.contas;
CREATE TRIGGER prevent_delete_conta_with_movements_trigger
BEFORE DELETE ON public.contas
FOR EACH ROW
EXECUTE FUNCTION public.prevent_delete_conta_with_movements();
