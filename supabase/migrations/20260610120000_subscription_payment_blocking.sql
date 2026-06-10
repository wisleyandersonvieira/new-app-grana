ALTER TABLE public.assinaturas
  ADD COLUMN IF NOT EXISTS latest_invoice_id text,
  ADD COLUMN IF NOT EXISTS latest_invoice_status text,
  ADD COLUMN IF NOT EXISTS latest_invoice_due_date timestamp with time zone,
  ADD COLUMN IF NOT EXISTS latest_invoice_hosted_url text,
  ADD COLUMN IF NOT EXISTS is_subscription_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subscription_block_reason text,
  ADD COLUMN IF NOT EXISTS subscription_checked_at timestamp with time zone;

UPDATE public.assinaturas
SET
  is_subscription_blocked = CASE
    WHEN status IN ('past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused') THEN true
    WHEN latest_invoice_status IN ('open', 'uncollectible')
      AND latest_invoice_due_date IS NOT NULL
      AND latest_invoice_due_date < now()
    THEN true
    ELSE false
  END,
  subscription_block_reason = CASE
    WHEN status IN ('past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused')
      THEN 'subscription_' || status
    WHEN latest_invoice_status IN ('open', 'uncollectible')
      AND latest_invoice_due_date IS NOT NULL
      AND latest_invoice_due_date < now()
      THEN 'invoice_open_overdue'
    ELSE null
  END,
  subscription_checked_at = coalesce(subscription_checked_at, synced_at, updated_at, now());

CREATE INDEX IF NOT EXISTS idx_assinaturas_subscription_blocked
  ON public.assinaturas(usuario_id, is_subscription_blocked);

CREATE OR REPLACE FUNCTION public.has_active_billing_access(target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE user_id = target_user_id
        AND coalesce(is_admin, false) = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.assinaturas
      WHERE usuario_id = target_user_id
        AND coalesce(is_subscription_blocked, false) = false
        AND status IN ('trial', 'active')
    );
$$;

DROP POLICY IF EXISTS "Users manage own contas SELECT" ON public.contas;
DROP POLICY IF EXISTS "Users manage own contas INSERT" ON public.contas;
DROP POLICY IF EXISTS "Users manage own contas UPDATE" ON public.contas;
DROP POLICY IF EXISTS "Users manage own contas DELETE" ON public.contas;
CREATE POLICY "Users manage own contas SELECT" ON public.contas FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own contas INSERT" ON public.contas FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own contas UPDATE" ON public.contas FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own contas DELETE" ON public.contas FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own categorias SELECT" ON public.categorias;
DROP POLICY IF EXISTS "Users manage own categorias INSERT" ON public.categorias;
DROP POLICY IF EXISTS "Users manage own categorias UPDATE" ON public.categorias;
DROP POLICY IF EXISTS "Users manage own categorias DELETE" ON public.categorias;
CREATE POLICY "Users manage own categorias SELECT" ON public.categorias FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own categorias INSERT" ON public.categorias FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own categorias UPDATE" ON public.categorias FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own categorias DELETE" ON public.categorias FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own subcategorias SELECT" ON public.subcategorias;
DROP POLICY IF EXISTS "Users manage own subcategorias INSERT" ON public.subcategorias;
DROP POLICY IF EXISTS "Users manage own subcategorias UPDATE" ON public.subcategorias;
DROP POLICY IF EXISTS "Users manage own subcategorias DELETE" ON public.subcategorias;
CREATE POLICY "Users manage own subcategorias SELECT" ON public.subcategorias FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own subcategorias INSERT" ON public.subcategorias FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own subcategorias UPDATE" ON public.subcategorias FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own subcategorias DELETE" ON public.subcategorias FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own receitas SELECT" ON public.receitas;
DROP POLICY IF EXISTS "Users manage own receitas INSERT" ON public.receitas;
DROP POLICY IF EXISTS "Users manage own receitas UPDATE" ON public.receitas;
DROP POLICY IF EXISTS "Users manage own receitas DELETE" ON public.receitas;
CREATE POLICY "Users manage own receitas SELECT" ON public.receitas FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own receitas INSERT" ON public.receitas FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own receitas UPDATE" ON public.receitas FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own receitas DELETE" ON public.receitas FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own despesas SELECT" ON public.despesas;
DROP POLICY IF EXISTS "Users manage own despesas INSERT" ON public.despesas;
DROP POLICY IF EXISTS "Users manage own despesas UPDATE" ON public.despesas;
DROP POLICY IF EXISTS "Users manage own despesas DELETE" ON public.despesas;
CREATE POLICY "Users manage own despesas SELECT" ON public.despesas FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own despesas INSERT" ON public.despesas FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own despesas UPDATE" ON public.despesas FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own despesas DELETE" ON public.despesas FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own transferencias SELECT" ON public.transferencias;
DROP POLICY IF EXISTS "Users manage own transferencias INSERT" ON public.transferencias;
DROP POLICY IF EXISTS "Users manage own transferencias UPDATE" ON public.transferencias;
DROP POLICY IF EXISTS "Users manage own transferencias DELETE" ON public.transferencias;
CREATE POLICY "Users manage own transferencias SELECT" ON public.transferencias FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own transferencias INSERT" ON public.transferencias FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own transferencias UPDATE" ON public.transferencias FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own transferencias DELETE" ON public.transferencias FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own faturas SELECT" ON public.faturas_cartao;
DROP POLICY IF EXISTS "Users manage own faturas INSERT" ON public.faturas_cartao;
DROP POLICY IF EXISTS "Users manage own faturas UPDATE" ON public.faturas_cartao;
DROP POLICY IF EXISTS "Users manage own faturas DELETE" ON public.faturas_cartao;
CREATE POLICY "Users manage own faturas SELECT" ON public.faturas_cartao FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own faturas INSERT" ON public.faturas_cartao FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own faturas UPDATE" ON public.faturas_cartao FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own faturas DELETE" ON public.faturas_cartao FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own itens_fatura SELECT" ON public.itens_fatura;
DROP POLICY IF EXISTS "Users manage own itens_fatura INSERT" ON public.itens_fatura;
DROP POLICY IF EXISTS "Users manage own itens_fatura UPDATE" ON public.itens_fatura;
DROP POLICY IF EXISTS "Users manage own itens_fatura DELETE" ON public.itens_fatura;
CREATE POLICY "Users manage own itens_fatura SELECT" ON public.itens_fatura FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own itens_fatura INSERT" ON public.itens_fatura FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own itens_fatura UPDATE" ON public.itens_fatura FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own itens_fatura DELETE" ON public.itens_fatura FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own metas SELECT" ON public.metas;
DROP POLICY IF EXISTS "Users manage own metas INSERT" ON public.metas;
DROP POLICY IF EXISTS "Users manage own metas UPDATE" ON public.metas;
DROP POLICY IF EXISTS "Users manage own metas DELETE" ON public.metas;
CREATE POLICY "Users manage own metas SELECT" ON public.metas FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own metas INSERT" ON public.metas FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own metas UPDATE" ON public.metas FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own metas DELETE" ON public.metas FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own bloqueios SELECT" ON public.bloqueios;
DROP POLICY IF EXISTS "Users manage own bloqueios INSERT" ON public.bloqueios;
DROP POLICY IF EXISTS "Users manage own bloqueios DELETE" ON public.bloqueios;
CREATE POLICY "Users manage own bloqueios SELECT" ON public.bloqueios FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own bloqueios INSERT" ON public.bloqueios FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own bloqueios DELETE" ON public.bloqueios FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own categorias_sugeridas_cartao SELECT" ON public.categorias_sugeridas_cartao;
DROP POLICY IF EXISTS "Users manage own categorias_sugeridas_cartao INSERT" ON public.categorias_sugeridas_cartao;
DROP POLICY IF EXISTS "Users manage own categorias_sugeridas_cartao UPDATE" ON public.categorias_sugeridas_cartao;
DROP POLICY IF EXISTS "Users manage own categorias_sugeridas_cartao DELETE" ON public.categorias_sugeridas_cartao;
CREATE POLICY "Users manage own categorias_sugeridas_cartao SELECT" ON public.categorias_sugeridas_cartao FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own categorias_sugeridas_cartao INSERT" ON public.categorias_sugeridas_cartao FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own categorias_sugeridas_cartao UPDATE" ON public.categorias_sugeridas_cartao FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own categorias_sugeridas_cartao DELETE" ON public.categorias_sugeridas_cartao FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));

DROP POLICY IF EXISTS "Users manage own importacoes_fatura_pdf SELECT" ON public.importacoes_fatura_pdf;
DROP POLICY IF EXISTS "Users manage own importacoes_fatura_pdf INSERT" ON public.importacoes_fatura_pdf;
DROP POLICY IF EXISTS "Users manage own importacoes_fatura_pdf UPDATE" ON public.importacoes_fatura_pdf;
DROP POLICY IF EXISTS "Users manage own importacoes_fatura_pdf DELETE" ON public.importacoes_fatura_pdf;
CREATE POLICY "Users manage own importacoes_fatura_pdf SELECT" ON public.importacoes_fatura_pdf FOR SELECT USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own importacoes_fatura_pdf INSERT" ON public.importacoes_fatura_pdf FOR INSERT WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own importacoes_fatura_pdf UPDATE" ON public.importacoes_fatura_pdf FOR UPDATE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid())) WITH CHECK (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
CREATE POLICY "Users manage own importacoes_fatura_pdf DELETE" ON public.importacoes_fatura_pdf FOR DELETE USING (auth.uid() = usuario_id AND public.has_active_billing_access(auth.uid()));
