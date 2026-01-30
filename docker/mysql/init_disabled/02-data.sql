INSERT INTO users (role, first_name, last_name, nickname, email, phone, birth_date, password_hash, must_reset_password)
VALUES
  ('admin', 'Administrador', 'Clube', 'Admin', 'admin@club.com', '+55 11 99999-0000', '1980-01-01', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 0),
  ('player', 'João', 'Silva', 'Joãozinho', 'joao@club.com', '+55 11 99888-1111', '1992-04-15', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 0),
  ('player', 'Maria', 'Oliveira', NULL, 'maria@club.com', '+55 11 99777-2222', '1995-09-30', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 0);

INSERT INTO ranking_memberships (ranking_id, user_id, position, points, is_blue_point)
VALUES
  (1, 2, 5, 120, 1),
  (1, 3, 8, 95, 0);

INSERT INTO rounds (title, reference_month, blue_point_opens_at, open_challenges_at, matches_deadline, featured_challenger_id, featured_challenged_id, featured_match_at, featured_result, updated_by)
VALUES
  ('Rodada Setembro 2025 - Geral', '2025-09-01', '2025-09-01 07:00:00', '2025-09-02 07:00:00', '2025-09-29 22:00:00', 2, 3, '2025-09-10 19:00:00', NULL, 1);
