-- Edge Functions hardening: cron throttle, Stripe webhook dedupe, facturas idempotency.
-- Idempotent and additive: safe to re-run and safe while the old frontend is live.

-- ── 1. Cron throttle ─────────────────────────────────────────────────────────
-- Cron/batch Edge Functions call cron_claim() (service role) when the caller is
-- neither the service role nor the super admin; it returns true at most once
-- per p_min_minutes for each p_nombre.
CREATE TABLE IF NOT EXISTS public.cron_runs (
  nombre text PRIMARY KEY,
  ultimo timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cron_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.cron_runs TO service_role;

CREATE OR REPLACE FUNCTION public.cron_claim(p_nombre text, p_min_minutes integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF p_nombre IS NULL OR btrim(p_nombre) = '' THEN
    RETURN false;
  END IF;

  INSERT INTO public.cron_runs AS c (nombre, ultimo)
  VALUES (p_nombre, now())
  ON CONFLICT (nombre) DO UPDATE
    SET ultimo = EXCLUDED.ultimo
    WHERE c.ultimo < now() - make_interval(mins => GREATEST(COALESCE(p_min_minutes, 0), 0))
  RETURNING true INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.cron_claim(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_claim(text, integer) TO service_role;

-- ── 2. Stripe webhook event dedupe ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_events (
  event_id text PRIMARY KEY,
  tipo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stripe_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.stripe_events TO service_role;

CREATE INDEX IF NOT EXISTS idx_stripe_events_created_at ON public.stripe_events (created_at);

-- ── 3. One factura per Stripe invoice ────────────────────────────────────────
-- Only created when no duplicates exist yet (otherwise it would fail); the
-- Edge Functions also dedupe in code, so skipping it is not fatal.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'facturas_stripe_invoice_id_uniq'
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.facturas
    WHERE stripe_invoice_id IS NOT NULL
    GROUP BY stripe_invoice_id
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'facturas: hay stripe_invoice_id duplicados; se omite el índice único facturas_stripe_invoice_id_uniq';
  ELSE
    CREATE UNIQUE INDEX facturas_stripe_invoice_id_uniq
      ON public.facturas (stripe_invoice_id)
      WHERE stripe_invoice_id IS NOT NULL;
  END IF;
END;
$$;
