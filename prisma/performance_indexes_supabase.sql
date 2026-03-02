-- Performance indexes for high-traffic queries (dashboard/challenges/rankings)
-- Safe to run multiple times.

-- challenges
CREATE INDEX IF NOT EXISTS idx_challenges_ranking_status_scheduled_for
  ON public.challenges (ranking_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_challenges_ranking_status_played_at
  ON public.challenges (ranking_id, status, played_at);

CREATE INDEX IF NOT EXISTS idx_challenges_challenged_status_scheduled_for
  ON public.challenges (challenged_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_challenges_challenger_status_scheduled_for
  ON public.challenges (challenger_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_challenges_challenged_status_played_at
  ON public.challenges (challenged_id, status, played_at);

CREATE INDEX IF NOT EXISTS idx_challenges_challenger_status_played_at
  ON public.challenges (challenger_id, status, played_at);

-- ranking_memberships
CREATE INDEX IF NOT EXISTS idx_ranking_memberships_ranking_position
  ON public.ranking_memberships (ranking_id, position);

CREATE INDEX IF NOT EXISTS idx_ranking_memberships_ranking_suspended
  ON public.ranking_memberships (ranking_id, is_suspended);

CREATE INDEX IF NOT EXISTS idx_ranking_memberships_ranking_blue_suspended
  ON public.ranking_memberships (ranking_id, is_blue_point, is_suspended);

-- rounds
CREATE INDEX IF NOT EXISTS idx_rounds_status_ranking_reference
  ON public.rounds (status, ranking_id, reference_month);

CREATE INDEX IF NOT EXISTS idx_rounds_reference_ranking
  ON public.rounds (reference_month, ranking_id);
