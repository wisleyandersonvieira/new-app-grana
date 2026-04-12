ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS empresa text,
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS access_blocked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

ALTER TABLE public.assinaturas
  ADD COLUMN IF NOT EXISTS stripe_product_id text,
  ADD COLUMN IF NOT EXISTS current_period_start timestamp with time zone,
  ADD COLUMN IF NOT EXISTS current_period_end timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS valor numeric(12,2),
  ADD COLUMN IF NOT EXISTS moeda text DEFAULT 'brl',
  ADD COLUMN IF NOT EXISTS frequencia text,
  ADD COLUMN IF NOT EXISTS payment_method_type text,
  ADD COLUMN IF NOT EXISTS payment_brand text,
  ADD COLUMN IF NOT EXISTS payment_last4 text,
  ADD COLUMN IF NOT EXISTS payment_exp_month integer,
  ADD COLUMN IF NOT EXISTS payment_exp_year integer,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS synced_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS stripe_status text;

UPDATE public.profiles
SET
  role = CASE WHEN coalesce(is_admin, false) THEN 'admin' ELSE 'user' END,
  last_login_at = coalesce(last_login_at, ultimo_acesso);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assinaturas'
      AND column_name = 'data_expiracao'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assinaturas'
      AND column_name = 'data_cancelamento'
  ) THEN
    EXECUTE $sql$
      UPDATE public.assinaturas
      SET
        current_period_end = coalesce(current_period_end, data_expiracao),
        stripe_status = coalesce(stripe_status, status),
        synced_at = coalesce(synced_at, updated_at, created_at),
        cancel_at = coalesce(cancel_at, data_cancelamento)
    $sql$;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'assinaturas'
      AND column_name = 'data_expiracao'
  ) THEN
    EXECUTE $sql$
      UPDATE public.assinaturas
      SET
        current_period_end = coalesce(current_period_end, data_expiracao),
        stripe_status = coalesce(stripe_status, status),
        synced_at = coalesce(synced_at, updated_at, created_at)
    $sql$;
  ELSE
    UPDATE public.assinaturas
    SET
      stripe_status = coalesce(stripe_status, status),
      synced_at = coalesce(synced_at, updated_at, created_at);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_user_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  acao text NOT NULL,
  detalhes jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stripe_subscription_id text UNIQUE,
  stripe_customer_id text,
  stripe_product_id text,
  stripe_price_id text,
  plan_name text,
  plan_interval text,
  amount numeric(12,2),
  currency text,
  status text NOT NULL DEFAULT 'incomplete',
  trial_start timestamp with time zone,
  trial_end timestamp with time zone,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancel_at timestamp with time zone,
  canceled_at timestamp with time zone,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stripe_customer_id text,
  stripe_payment_method_id text UNIQUE,
  type text,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean NOT NULL DEFAULT false,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  stripe_invoice_id text UNIQUE,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text,
  amount_due numeric(12,2),
  amount_paid numeric(12,2),
  amount_remaining numeric(12,2),
  currency text,
  invoice_pdf text,
  hosted_invoice_url text,
  paid_at timestamp with time zone,
  due_date timestamp with time zone,
  period_start timestamp with time zone,
  period_end timestamp with time zone,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  raw_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_user_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE user_id = auth.uid()
      AND coalesce(is_admin, false) = true
  );
$$;

DROP POLICY IF EXISTS "Admins view all profiles" ON public.profiles;
CREATE POLICY "Admins view all profiles"
ON public.profiles
FOR SELECT
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update all profiles" ON public.profiles;
CREATE POLICY "Admins update all profiles"
ON public.profiles
FOR UPDATE
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins view all subscriptions" ON public.assinaturas;
CREATE POLICY "Admins view all subscriptions"
ON public.assinaturas
FOR SELECT
USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update all subscriptions" ON public.assinaturas;
CREATE POLICY "Admins update all subscriptions"
ON public.assinaturas
FOR UPDATE
USING (public.is_admin());

DROP POLICY IF EXISTS "Users view own admin logs" ON public.admin_user_logs;
CREATE POLICY "Users view own admin logs"
ON public.admin_user_logs
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Admins insert admin logs" ON public.admin_user_logs;
CREATE POLICY "Admins insert admin logs"
ON public.admin_user_logs
FOR INSERT
WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Users view own billing subscriptions" ON public.billing_subscriptions;
CREATE POLICY "Users view own billing subscriptions"
ON public.billing_subscriptions
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users view own billing payment methods" ON public.billing_payment_methods;
CREATE POLICY "Users view own billing payment methods"
ON public.billing_payment_methods
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "Users view own billing invoices" ON public.billing_invoices;
CREATE POLICY "Users view own billing invoices"
ON public.billing_invoices
FOR SELECT
USING (auth.uid() = user_id OR public.is_admin());

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_last_login_at ON public.profiles(last_login_at);
CREATE INDEX IF NOT EXISTS idx_profiles_access_blocked ON public.profiles(access_blocked);
CREATE INDEX IF NOT EXISTS idx_assinaturas_status ON public.assinaturas(status);
CREATE INDEX IF NOT EXISTS idx_assinaturas_current_period_end ON public.assinaturas(current_period_end);
CREATE INDEX IF NOT EXISTS idx_admin_user_logs_user_created_at ON public.admin_user_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_user_logs_admin_created_at ON public.admin_user_logs(admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_id ON public.billing_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_payment_methods_user_id ON public.billing_payment_methods(user_id);
CREATE INDEX IF NOT EXISTS idx_billing_invoices_user_id ON public.billing_invoices(user_id);

DROP TRIGGER IF EXISTS update_billing_subscriptions_updated_at ON public.billing_subscriptions;
CREATE TRIGGER update_billing_subscriptions_updated_at
BEFORE UPDATE ON public.billing_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_billing_payment_methods_updated_at ON public.billing_payment_methods;
CREATE TRIGGER update_billing_payment_methods_updated_at
BEFORE UPDATE ON public.billing_payment_methods
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_billing_invoices_updated_at ON public.billing_invoices;
CREATE TRIGGER update_billing_invoices_updated_at
BEFORE UPDATE ON public.billing_invoices
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
