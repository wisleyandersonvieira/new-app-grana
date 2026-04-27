-- Segunda rodada de hardening: RLS explicito e integridade de referencias por usuario.
-- Objetivo: impedir IDOR/BOLA por registros que apontem para contas, categorias,
-- subcategorias ou faturas pertencentes a outro usuario.

CREATE OR REPLACE FUNCTION public.assert_owned_conta(p_usuario_id UUID, p_conta_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_conta_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.contas
      WHERE id = p_conta_id AND usuario_id = p_usuario_id
    )
  THEN
    RAISE EXCEPTION 'Invalid account reference';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_owned_categoria(p_usuario_id UUID, p_categoria_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_categoria_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.categorias
      WHERE id = p_categoria_id AND usuario_id = p_usuario_id
    )
  THEN
    RAISE EXCEPTION 'Invalid category reference';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_owned_subcategoria(
  p_usuario_id UUID,
  p_subcategoria_id UUID,
  p_categoria_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_subcategoria_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.subcategorias
      WHERE id = p_subcategoria_id
        AND usuario_id = p_usuario_id
        AND (p_categoria_id IS NULL OR categoria_id = p_categoria_id)
    )
  THEN
    RAISE EXCEPTION 'Invalid subcategory reference';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_owned_fatura(p_usuario_id UUID, p_fatura_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_fatura_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.faturas_cartao
      WHERE id = p_fatura_id AND usuario_id = p_usuario_id
    )
  THEN
    RAISE EXCEPTION 'Invalid invoice reference';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_owned_despesa(p_usuario_id UUID, p_despesa_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_despesa_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.despesas
      WHERE id = p_despesa_id AND usuario_id = p_usuario_id
    )
  THEN
    RAISE EXCEPTION 'Invalid expense reference';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.try_uuid(p_value TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN p_value::UUID;
EXCEPTION
  WHEN invalid_text_representation THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_subcategorias_owner_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_owned_categoria(NEW.usuario_id, NEW.categoria_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_receitas_owner_refs()
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

CREATE OR REPLACE FUNCTION public.validate_despesas_owner_refs()
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

CREATE OR REPLACE FUNCTION public.validate_transferencias_owner_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_owned_conta(NEW.usuario_id, NEW.conta_origem_id);
  PERFORM public.assert_owned_conta(NEW.usuario_id, NEW.conta_destino_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_faturas_cartao_owner_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_owned_conta(NEW.usuario_id, NEW.conta_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_itens_fatura_owner_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_owned_fatura(NEW.usuario_id, NEW.fatura_id);
  PERFORM public.assert_owned_categoria(NEW.usuario_id, NEW.categoria_id);
  PERFORM public.assert_owned_subcategoria(NEW.usuario_id, NEW.subcategoria_id, NEW.categoria_id);
  PERFORM public.assert_owned_categoria(NEW.usuario_id, NEW.categoria_sugerida_id);
  PERFORM public.assert_owned_subcategoria(NEW.usuario_id, NEW.subcategoria_sugerida_id, NEW.categoria_sugerida_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_metas_owner_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_owned_categoria(NEW.usuario_id, NEW.categoria_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_categorias_sugeridas_owner_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_owned_conta(NEW.usuario_id, NEW.cartao_id);
  PERFORM public.assert_owned_categoria(NEW.usuario_id, NEW.categoria_id);
  PERFORM public.assert_owned_subcategoria(NEW.usuario_id, NEW.subcategoria_id, NEW.categoria_id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_importacoes_fatura_pdf_owner_refs()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.assert_owned_conta(NEW.usuario_id, NEW.cartao_id);
  PERFORM public.assert_owned_fatura(NEW.usuario_id, NEW.fatura_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_subcategorias_owner_refs ON public.subcategorias;
CREATE TRIGGER validate_subcategorias_owner_refs
  BEFORE INSERT OR UPDATE ON public.subcategorias
  FOR EACH ROW EXECUTE FUNCTION public.validate_subcategorias_owner_refs();

DROP TRIGGER IF EXISTS validate_receitas_owner_refs ON public.receitas;
CREATE TRIGGER validate_receitas_owner_refs
  BEFORE INSERT OR UPDATE ON public.receitas
  FOR EACH ROW EXECUTE FUNCTION public.validate_receitas_owner_refs();

DROP TRIGGER IF EXISTS validate_despesas_owner_refs ON public.despesas;
CREATE TRIGGER validate_despesas_owner_refs
  BEFORE INSERT OR UPDATE ON public.despesas
  FOR EACH ROW EXECUTE FUNCTION public.validate_despesas_owner_refs();

DROP TRIGGER IF EXISTS validate_transferencias_owner_refs ON public.transferencias;
CREATE TRIGGER validate_transferencias_owner_refs
  BEFORE INSERT OR UPDATE ON public.transferencias
  FOR EACH ROW EXECUTE FUNCTION public.validate_transferencias_owner_refs();

DROP TRIGGER IF EXISTS validate_faturas_cartao_owner_refs ON public.faturas_cartao;
CREATE TRIGGER validate_faturas_cartao_owner_refs
  BEFORE INSERT OR UPDATE ON public.faturas_cartao
  FOR EACH ROW EXECUTE FUNCTION public.validate_faturas_cartao_owner_refs();

DROP TRIGGER IF EXISTS validate_itens_fatura_owner_refs ON public.itens_fatura;
CREATE TRIGGER validate_itens_fatura_owner_refs
  BEFORE INSERT OR UPDATE ON public.itens_fatura
  FOR EACH ROW EXECUTE FUNCTION public.validate_itens_fatura_owner_refs();

DROP TRIGGER IF EXISTS validate_metas_owner_refs ON public.metas;
CREATE TRIGGER validate_metas_owner_refs
  BEFORE INSERT OR UPDATE ON public.metas
  FOR EACH ROW EXECUTE FUNCTION public.validate_metas_owner_refs();

DROP TRIGGER IF EXISTS validate_categorias_sugeridas_owner_refs ON public.categorias_sugeridas_cartao;
CREATE TRIGGER validate_categorias_sugeridas_owner_refs
  BEFORE INSERT OR UPDATE ON public.categorias_sugeridas_cartao
  FOR EACH ROW EXECUTE FUNCTION public.validate_categorias_sugeridas_owner_refs();

DROP TRIGGER IF EXISTS validate_importacoes_fatura_pdf_owner_refs ON public.importacoes_fatura_pdf;
CREATE TRIGGER validate_importacoes_fatura_pdf_owner_refs
  BEFORE INSERT OR UPDATE ON public.importacoes_fatura_pdf
  FOR EACH ROW EXECUTE FUNCTION public.validate_importacoes_fatura_pdf_owner_refs();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assinaturas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcategorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receitas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.despesas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faturas_cartao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itens_fatura ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bloqueios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categorias_sugeridas_cartao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.importacoes_fatura_pdf ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_user_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own contas" ON public.contas;
DROP POLICY IF EXISTS "Users manage own contas SELECT" ON public.contas;
DROP POLICY IF EXISTS "Users manage own contas INSERT" ON public.contas;
DROP POLICY IF EXISTS "Users manage own contas UPDATE" ON public.contas;
DROP POLICY IF EXISTS "Users manage own contas DELETE" ON public.contas;
CREATE POLICY "Users manage own contas SELECT" ON public.contas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own contas INSERT" ON public.contas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own contas UPDATE" ON public.contas FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own contas DELETE" ON public.contas FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own categorias" ON public.categorias;
DROP POLICY IF EXISTS "Users manage own categorias SELECT" ON public.categorias;
DROP POLICY IF EXISTS "Users manage own categorias INSERT" ON public.categorias;
DROP POLICY IF EXISTS "Users manage own categorias UPDATE" ON public.categorias;
DROP POLICY IF EXISTS "Users manage own categorias DELETE" ON public.categorias;
CREATE POLICY "Users manage own categorias SELECT" ON public.categorias FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias INSERT" ON public.categorias FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias UPDATE" ON public.categorias FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias DELETE" ON public.categorias FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own subcategorias" ON public.subcategorias;
DROP POLICY IF EXISTS "Users manage own subcategorias SELECT" ON public.subcategorias;
DROP POLICY IF EXISTS "Users manage own subcategorias INSERT" ON public.subcategorias;
DROP POLICY IF EXISTS "Users manage own subcategorias UPDATE" ON public.subcategorias;
DROP POLICY IF EXISTS "Users manage own subcategorias DELETE" ON public.subcategorias;
CREATE POLICY "Users manage own subcategorias SELECT" ON public.subcategorias FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own subcategorias INSERT" ON public.subcategorias FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own subcategorias UPDATE" ON public.subcategorias FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own subcategorias DELETE" ON public.subcategorias FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own receitas" ON public.receitas;
DROP POLICY IF EXISTS "Users manage own receitas SELECT" ON public.receitas;
DROP POLICY IF EXISTS "Users manage own receitas INSERT" ON public.receitas;
DROP POLICY IF EXISTS "Users manage own receitas UPDATE" ON public.receitas;
DROP POLICY IF EXISTS "Users manage own receitas DELETE" ON public.receitas;
CREATE POLICY "Users manage own receitas SELECT" ON public.receitas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own receitas INSERT" ON public.receitas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own receitas UPDATE" ON public.receitas FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own receitas DELETE" ON public.receitas FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own despesas" ON public.despesas;
DROP POLICY IF EXISTS "Users manage own despesas SELECT" ON public.despesas;
DROP POLICY IF EXISTS "Users manage own despesas INSERT" ON public.despesas;
DROP POLICY IF EXISTS "Users manage own despesas UPDATE" ON public.despesas;
DROP POLICY IF EXISTS "Users manage own despesas DELETE" ON public.despesas;
CREATE POLICY "Users manage own despesas SELECT" ON public.despesas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own despesas INSERT" ON public.despesas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own despesas UPDATE" ON public.despesas FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own despesas DELETE" ON public.despesas FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own transferencias" ON public.transferencias;
DROP POLICY IF EXISTS "Users manage own transferencias SELECT" ON public.transferencias;
DROP POLICY IF EXISTS "Users manage own transferencias INSERT" ON public.transferencias;
DROP POLICY IF EXISTS "Users manage own transferencias UPDATE" ON public.transferencias;
DROP POLICY IF EXISTS "Users manage own transferencias DELETE" ON public.transferencias;
CREATE POLICY "Users manage own transferencias SELECT" ON public.transferencias FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own transferencias INSERT" ON public.transferencias FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own transferencias UPDATE" ON public.transferencias FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own transferencias DELETE" ON public.transferencias FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own faturas" ON public.faturas_cartao;
DROP POLICY IF EXISTS "Users manage own faturas SELECT" ON public.faturas_cartao;
DROP POLICY IF EXISTS "Users manage own faturas INSERT" ON public.faturas_cartao;
DROP POLICY IF EXISTS "Users manage own faturas UPDATE" ON public.faturas_cartao;
DROP POLICY IF EXISTS "Users manage own faturas DELETE" ON public.faturas_cartao;
CREATE POLICY "Users manage own faturas SELECT" ON public.faturas_cartao FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own faturas INSERT" ON public.faturas_cartao FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own faturas UPDATE" ON public.faturas_cartao FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own faturas DELETE" ON public.faturas_cartao FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own itens_fatura" ON public.itens_fatura;
DROP POLICY IF EXISTS "Users manage own itens_fatura SELECT" ON public.itens_fatura;
DROP POLICY IF EXISTS "Users manage own itens_fatura INSERT" ON public.itens_fatura;
DROP POLICY IF EXISTS "Users manage own itens_fatura UPDATE" ON public.itens_fatura;
DROP POLICY IF EXISTS "Users manage own itens_fatura DELETE" ON public.itens_fatura;
CREATE POLICY "Users manage own itens_fatura SELECT" ON public.itens_fatura FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own itens_fatura INSERT" ON public.itens_fatura FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own itens_fatura UPDATE" ON public.itens_fatura FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own itens_fatura DELETE" ON public.itens_fatura FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own metas" ON public.metas;
DROP POLICY IF EXISTS "Users manage own metas SELECT" ON public.metas;
DROP POLICY IF EXISTS "Users manage own metas INSERT" ON public.metas;
DROP POLICY IF EXISTS "Users manage own metas UPDATE" ON public.metas;
DROP POLICY IF EXISTS "Users manage own metas DELETE" ON public.metas;
CREATE POLICY "Users manage own metas SELECT" ON public.metas FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own metas INSERT" ON public.metas FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own metas UPDATE" ON public.metas FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own metas DELETE" ON public.metas FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own bloqueios" ON public.bloqueios;
DROP POLICY IF EXISTS "Users manage own bloqueios SELECT" ON public.bloqueios;
DROP POLICY IF EXISTS "Users manage own bloqueios INSERT" ON public.bloqueios;
DROP POLICY IF EXISTS "Users manage own bloqueios DELETE" ON public.bloqueios;
CREATE POLICY "Users manage own bloqueios SELECT" ON public.bloqueios FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own bloqueios INSERT" ON public.bloqueios FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own bloqueios DELETE" ON public.bloqueios FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own categorias_sugeridas_cartao SELECT" ON public.categorias_sugeridas_cartao;
DROP POLICY IF EXISTS "Users manage own categorias_sugeridas_cartao INSERT" ON public.categorias_sugeridas_cartao;
DROP POLICY IF EXISTS "Users manage own categorias_sugeridas_cartao UPDATE" ON public.categorias_sugeridas_cartao;
DROP POLICY IF EXISTS "Users manage own categorias_sugeridas_cartao DELETE" ON public.categorias_sugeridas_cartao;
CREATE POLICY "Users manage own categorias_sugeridas_cartao SELECT" ON public.categorias_sugeridas_cartao FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias_sugeridas_cartao INSERT" ON public.categorias_sugeridas_cartao FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias_sugeridas_cartao UPDATE" ON public.categorias_sugeridas_cartao FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own categorias_sugeridas_cartao DELETE" ON public.categorias_sugeridas_cartao FOR DELETE USING (auth.uid() = usuario_id);

DROP POLICY IF EXISTS "Users manage own importacoes_fatura_pdf SELECT" ON public.importacoes_fatura_pdf;
DROP POLICY IF EXISTS "Users manage own importacoes_fatura_pdf INSERT" ON public.importacoes_fatura_pdf;
DROP POLICY IF EXISTS "Users manage own importacoes_fatura_pdf UPDATE" ON public.importacoes_fatura_pdf;
DROP POLICY IF EXISTS "Users manage own importacoes_fatura_pdf DELETE" ON public.importacoes_fatura_pdf;
CREATE POLICY "Users manage own importacoes_fatura_pdf SELECT" ON public.importacoes_fatura_pdf FOR SELECT USING (auth.uid() = usuario_id);
CREATE POLICY "Users manage own importacoes_fatura_pdf INSERT" ON public.importacoes_fatura_pdf FOR INSERT WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own importacoes_fatura_pdf UPDATE" ON public.importacoes_fatura_pdf FOR UPDATE USING (auth.uid() = usuario_id) WITH CHECK (auth.uid() = usuario_id);
CREATE POLICY "Users manage own importacoes_fatura_pdf DELETE" ON public.importacoes_fatura_pdf FOR DELETE USING (auth.uid() = usuario_id);
