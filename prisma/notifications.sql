-- Fase B/C — Central de notificacoes
-- Rodar no Supabase (SQL editor) ou via psql ANTES de subir o codigo novo.
-- Idempotente: pode rodar mais de uma vez sem erro.

-- Enum dos tipos de notificacao (inclui valores usados na Fase C).
DO $$
BEGIN
  CREATE TYPE public.notification_type AS ENUM (
    'challenge_received',
    'removal_requested',
    'removal_approved',
    'removal_rejected'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Tabela de notificacoes (feed por destinatario).
CREATE TABLE IF NOT EXISTS public.notifications (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL,
  type       public.notification_type NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT,
  data       JSONB,
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP(3) DEFAULT now(),
  read_at    TIMESTAMP(3),
  CONSTRAINT notifications_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS notifications_user_id_is_read_idx
  ON public.notifications (user_id, is_read);

CREATE INDEX IF NOT EXISTS notifications_user_id_created_at_idx
  ON public.notifications (user_id, created_at);
