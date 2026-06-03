-- Fase C — Pedidos de saida de ranking
-- Rodar no Supabase (SQL editor) ANTES de subir o codigo da Fase C.
-- Idempotente: pode rodar mais de uma vez sem erro.

-- Status do pedido de saida.
DO $$
BEGIN
  CREATE TYPE public.removal_request_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- Tabela de pedidos de saida de ranking.
CREATE TABLE IF NOT EXISTS public.ranking_removal_requests (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  ranking_id  INTEGER NOT NULL,
  status      public.removal_request_status NOT NULL DEFAULT 'pending',
  reason      TEXT,
  created_at  TIMESTAMP(3) DEFAULT now(),
  resolved_by INTEGER,
  resolved_at TIMESTAMP(3),
  CONSTRAINT ranking_removal_requests_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users(id)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT ranking_removal_requests_ranking_id_fkey
    FOREIGN KEY (ranking_id) REFERENCES public.rankings(id)
    ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX IF NOT EXISTS ranking_removal_requests_status_idx
  ON public.ranking_removal_requests (status);

CREATE INDEX IF NOT EXISTS ranking_removal_requests_user_id_idx
  ON public.ranking_removal_requests (user_id);

CREATE INDEX IF NOT EXISTS ranking_removal_requests_ranking_id_idx
  ON public.ranking_removal_requests (ranking_id);

-- Evita dois pedidos pendentes para o mesmo jogador na mesma categoria.
CREATE UNIQUE INDEX IF NOT EXISTS ranking_removal_requests_unique_pending
  ON public.ranking_removal_requests (user_id, ranking_id)
  WHERE status = 'pending';
