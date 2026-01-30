CREATE TABLE IF NOT EXISTS users (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    role ENUM('admin', 'collaborator', 'player', 'member') NOT NULL DEFAULT 'player',
    gender ENUM('male', 'female', 'other') DEFAULT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    nickname VARCHAR(100) DEFAULT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    phone VARCHAR(30) DEFAULT NULL,
    birth_date DATE DEFAULT NULL,
    password_hash VARCHAR(255) NOT NULL,
    must_reset_password TINYINT(1) NOT NULL DEFAULT 0,
    password_reset_token VARCHAR(128) DEFAULT NULL,
    password_reset_expires_at DATETIME DEFAULT NULL,
    avatar_path VARCHAR(255) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rankings (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,
    description TEXT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ranking_memberships (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ranking_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    position INT UNSIGNED DEFAULT NULL,
    points INT DEFAULT 0,
    is_blue_point TINYINT(1) DEFAULT 0,
    is_access_challenge TINYINT(1) NOT NULL DEFAULT 0,
    is_locked TINYINT(1) DEFAULT 0,
    is_suspended TINYINT(1) DEFAULT 0,
    UNIQUE KEY uniq_ranking_user (ranking_id, user_id),
    CONSTRAINT fk_membership_ranking FOREIGN KEY (ranking_id) REFERENCES rankings (id) ON DELETE CASCADE,
    CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS rounds (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ranking_id INT UNSIGNED DEFAULT NULL,
    title VARCHAR(150) NOT NULL,
    reference_month DATE NOT NULL,
    round_opens_at DATETIME DEFAULT NULL,
    blue_point_opens_at DATETIME NOT NULL,
    blue_point_closes_at DATETIME DEFAULT NULL,
    open_challenges_at DATETIME NOT NULL,
    open_challenges_end_at DATETIME DEFAULT NULL,
    matches_deadline DATETIME NOT NULL,
    featured_challenger_id INT UNSIGNED DEFAULT NULL,
    featured_challenged_id INT UNSIGNED DEFAULT NULL,
    featured_match_at DATETIME DEFAULT NULL,
    featured_result VARCHAR(100) DEFAULT NULL,
    updated_by INT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    status ENUM('draft','open','closed') NOT NULL DEFAULT 'open',
    closed_at DATETIME DEFAULT NULL,
    CONSTRAINT fk_round_ranking FOREIGN KEY (ranking_id) REFERENCES rankings (id) ON DELETE SET NULL,
    CONSTRAINT fk_round_user_updater FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_round_user_challenger FOREIGN KEY (featured_challenger_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_round_user_challenged FOREIGN KEY (featured_challenged_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS challenges (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ranking_id INT UNSIGNED NOT NULL,
    challenger_id INT UNSIGNED NOT NULL,
    challenged_id INT UNSIGNED NOT NULL,
    scheduled_for DATETIME NOT NULL,
    accepted_at DATETIME DEFAULT NULL,
    declined_at DATETIME DEFAULT NULL,
    decline_reason VARCHAR(255) DEFAULT NULL,
    played_at DATETIME DEFAULT NULL,
    result_reported_at DATETIME DEFAULT NULL,
    challenger_games TINYINT DEFAULT NULL,
    challenged_games TINYINT DEFAULT NULL,
    challenger_tiebreak TINYINT DEFAULT NULL,
    challenged_tiebreak TINYINT DEFAULT NULL,
    challenger_walkover TINYINT(1) DEFAULT 0,
    challenged_walkover TINYINT(1) DEFAULT 0,
    challenger_retired TINYINT(1) DEFAULT 0,
    challenged_retired TINYINT(1) DEFAULT 0,
    challenger_position_at_challenge INT UNSIGNED DEFAULT NULL,
    challenged_position_at_challenge INT UNSIGNED DEFAULT NULL,
    winner ENUM('challenger','challenged') DEFAULT NULL,
    notes TEXT DEFAULT NULL,
    penalty_summary JSON DEFAULT NULL,
    cancelled_by_admin TINYINT(1) NOT NULL DEFAULT 0,
    status ENUM('scheduled','accepted','declined','completed','cancelled') NOT NULL DEFAULT 'scheduled',
    round_id INT UNSIGNED DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_challenge_ranking FOREIGN KEY (ranking_id) REFERENCES rankings (id) ON DELETE CASCADE,
    CONSTRAINT fk_challenge_round FOREIGN KEY (round_id) REFERENCES rounds (id) ON DELETE SET NULL,
    CONSTRAINT fk_challenge_challenger FOREIGN KEY (challenger_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_challenge_challenged FOREIGN KEY (challenged_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS challenge_events (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    challenge_id INT UNSIGNED NOT NULL,
    event_type ENUM('created','updated','completed','cancelled') NOT NULL,
    payload JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INT UNSIGNED DEFAULT NULL,
    CONSTRAINT fk_event_challenge FOREIGN KEY (challenge_id) REFERENCES challenges (id) ON DELETE CASCADE,
    CONSTRAINT fk_event_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS challenge_penalties (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    challenge_id INT UNSIGNED NOT NULL,
    applies_to ENUM('challenger','challenged','both') NOT NULL,
    positions SMALLINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_penalty_challenge FOREIGN KEY (challenge_id) REFERENCES challenges (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ranking_snapshots (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ranking_id INT UNSIGNED NOT NULL,
    round_month DATE NOT NULL,
    snapshot_type ENUM('start','end') NOT NULL DEFAULT 'start',
    user_id INT UNSIGNED NOT NULL,
    position INT UNSIGNED NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_snapshot (ranking_id, round_month, snapshot_type, user_id),
    KEY idx_snapshot_month (ranking_id, round_month, snapshot_type),
    CONSTRAINT fk_snapshot_ranking FOREIGN KEY (ranking_id) REFERENCES rankings (id) ON DELETE CASCADE,
    CONSTRAINT fk_snapshot_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS round_logs (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ranking_id INT UNSIGNED NOT NULL,
    reference_month DATE NOT NULL,
    line_no INT UNSIGNED NOT NULL,
    message TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_round_logs_ranking FOREIGN KEY (ranking_id) REFERENCES rankings (id) ON DELETE CASCADE,
    KEY idx_round_logs (ranking_id, reference_month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS blue_point_history (
    id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    ranking_id INT UNSIGNED NOT NULL,
    user_id INT UNSIGNED NOT NULL,
    month_key DATE NOT NULL,
    reason ENUM('consecutive_challenges','no_reachable_opponent','manual') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_blue_point (ranking_id, user_id, month_key, reason),
    CONSTRAINT fk_blue_point_ranking FOREIGN KEY (ranking_id) REFERENCES rankings (id) ON DELETE CASCADE,
    CONSTRAINT fk_blue_point_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO rankings (name, slug, description) VALUES
    ('Ranking Masculino Geral', 'ranking-masculino', 'Ranking geral masculino do clube'),
    ('Ranking Feminino Geral', 'ranking-feminino', 'Ranking geral feminino do clube'),
    ('Ranking Master 45+', 'ranking-master-45', 'Ranking master para jogadores 45+');
