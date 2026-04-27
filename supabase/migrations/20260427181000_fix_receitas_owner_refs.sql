-- Corrige a validacao de integridade de receitas criada na rodada de hardening.
-- Receitas nao possuem despesa_pai_id, e lote_id nao representa uma fatura.

CREATE OR REPLACE FUNCTION public.validate_receitas_owner_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_owned_conta(NEW.usuario_id, NEW.conta_id);
  PERFORM public.assert_owned_categoria(NEW.usuario_id, NEW.categoria_id);
  PERFORM public.assert_owned_subcategoria(NEW.usuario_id, NEW.subcategoria_id, NEW.categoria_id);
  RETURN NEW;
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
  PERFORM public.assert_owned_fatura(NEW.usuario_id, public.try_uuid(NEW.lote_id));
  RETURN NEW;
END;
$$;
