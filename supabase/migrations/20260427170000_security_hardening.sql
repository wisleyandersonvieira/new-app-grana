CREATE TABLE IF NOT EXISTS public.security_rate_limits (
  key text PRIMARY KEY,
  action text NOT NULL,
  window_start timestamp with time zone NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.security_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No client access to security rate limits" ON public.security_rate_limits;
CREATE POLICY "No client access to security rate limits"
ON public.security_rate_limits
FOR ALL
USING (false)
WITH CHECK (false);

CREATE TABLE IF NOT EXISTS public.security_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.security_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins view security audit events" ON public.security_audit_events;
CREATE POLICY "Admins view security audit events"
ON public.security_audit_events
FOR SELECT
USING (public.is_admin());

DROP POLICY IF EXISTS "No client writes to security audit events" ON public.security_audit_events;
CREATE POLICY "No client writes to security audit events"
ON public.security_audit_events
FOR INSERT
WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_security_audit_events_created_at
ON public.security_audit_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_events_user_created_at
ON public.security_audit_events (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF coalesce(OLD.is_admin, false) IS DISTINCT FROM coalesce(NEW.is_admin, false)
    OR coalesce(OLD.role, '') IS DISTINCT FROM coalesce(NEW.role, '')
    OR coalesce(OLD.status, '') IS DISTINCT FROM coalesce(NEW.status, '')
    OR coalesce(OLD.access_blocked, false) IS DISTINCT FROM coalesce(NEW.access_blocked, false)
    OR coalesce(OLD.internal_notes, '') IS DISTINCT FROM coalesce(NEW.internal_notes, '') THEN
    RAISE EXCEPTION 'Cannot update privileged profile fields';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

ALTER TABLE public.receitas
  ADD CONSTRAINT receitas_valor_positive CHECK (valor > 0) NOT VALID;

ALTER TABLE public.despesas
  ADD CONSTRAINT despesas_valor_positive CHECK (valor > 0) NOT VALID;

ALTER TABLE public.transferencias
  ADD CONSTRAINT transferencias_valor_positive CHECK (valor > 0) NOT VALID;

ALTER TABLE public.metas
  ADD CONSTRAINT metas_valor_positive CHECK (valor > 0) NOT VALID;
