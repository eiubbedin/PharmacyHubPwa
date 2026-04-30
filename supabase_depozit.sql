-- ============================================================
-- Depozit: confirmare preluare + status per produs
-- Rulează în: Supabase Dashboard → SQL Editor
-- ============================================================

-- Tabel preluări comenzi de depozit
CREATE TABLE IF NOT EXISTS depot_pickups (
  id              bigserial PRIMARY KEY,
  order_session_id integer NOT NULL REFERENCES order_sessions(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  picked_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_session_id, user_id)
);

ALTER TABLE depot_pickups ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'depot_pickups' AND policyname = 'depot_pickups_all') THEN
    CREATE POLICY depot_pickups_all ON depot_pickups
      FOR ALL TO authenticated USING (true) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- Tabel status per produs (bifat de depozit)
CREATE TABLE IF NOT EXISTS depot_line_checks (
  id              bigserial PRIMARY KEY,
  order_line_id   integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  checked         boolean NOT NULL DEFAULT true,
  checked_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_line_id, user_id)
);

ALTER TABLE depot_line_checks ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'depot_line_checks' AND policyname = 'depot_line_checks_all') THEN
    CREATE POLICY depot_line_checks_all ON depot_line_checks
      FOR ALL TO authenticated USING (true) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

SELECT 'depot_pickups + depot_line_checks create cu succes' as status;
