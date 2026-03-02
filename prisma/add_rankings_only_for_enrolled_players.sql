ALTER TABLE public.rankings
ADD COLUMN IF NOT EXISTS only_for_enrolled_players boolean NOT NULL DEFAULT false;
