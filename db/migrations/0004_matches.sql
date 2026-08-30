-- Persistencia de partidas y agregados de leaderboard.

CREATE TABLE matches (
  id           TEXT PRIMARY KEY,             -- ULID acuñado por el Durable Object
  room_code    TEXT NOT NULL,
  mode         TEXT NOT NULL CHECK (mode IN ('solo','casual','ranked')),
  life_mode    TEXT NOT NULL,
  lang         TEXT NOT NULL,
  category     TEXT NOT NULL,
  difficulty   TEXT NOT NULL,
  time_limit_s INTEGER NOT NULL DEFAULT 0,
  total_rounds INTEGER NOT NULL,
  season_id    TEXT REFERENCES seasons(id),  -- no nulo solo en ranked
  player_count INTEGER NOT NULL,
  started_at   INTEGER NOT NULL,
  ended_at     INTEGER,
  abandoned    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_matches_season ON matches(season_id, started_at);

CREATE TABLE match_rounds (
  id         TEXT PRIMARY KEY,
  match_id   TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  round_no   INTEGER NOT NULL,
  phrase_id  TEXT NOT NULL REFERENCES phrases(id),
  started_at INTEGER NOT NULL,               -- hora del servidor: el disparo de salida
  ended_at   INTEGER,
  -- No nulo = ronda ya puntuada. Es el guard de idempotencia a nivel de base:
  -- si un reintento vuelve a puntuar, el UPDATE no toca filas y el batch se descarta.
  scored_at  INTEGER
);
CREATE UNIQUE INDEX ux_rounds ON match_rounds(match_id, round_no);

CREATE TABLE round_results (
  round_id    TEXT NOT NULL REFERENCES match_rounds(id) ON DELETE CASCADE,
  slot        INTEGER NOT NULL,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,  -- NULL para invitados
  nickname    TEXT NOT NULL,                                 -- copia: sobrevive a renombres
  status      TEXT NOT NULL CHECK (status IN ('finished','timeout','eliminated','dnf','disconnected')),
  finish_rank INTEGER NOT NULL,
  finish_seq  INTEGER,
  finish_ms   INTEGER,                        -- NULL si no terminó; nunca un 0 centinela
  chars_typed INTEGER NOT NULL,
  chars_total INTEGER NOT NULL,
  errors      INTEGER NOT NULL,
  wpm         REAL NOT NULL,
  accuracy    REAL NOT NULL,
  points      INTEGER NOT NULL,
  suspicion   INTEGER NOT NULL DEFAULT 0,     -- bits de las heurísticas anti-cheat
  PRIMARY KEY (round_id, slot)
);
CREATE INDEX ix_rr_user ON round_results(user_id, wpm DESC);

CREATE TABLE match_results (
  match_id     TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  slot         INTEGER NOT NULL,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  nickname     TEXT NOT NULL,
  final_rank   INTEGER NOT NULL,
  total_points INTEGER NOT NULL,
  avg_wpm      REAL NOT NULL,
  elo_before   INTEGER,
  elo_after    INTEGER,
  elo_delta    INTEGER,
  PRIMARY KEY (match_id, slot)
);
CREATE INDEX ix_mr_user ON match_results(user_id, match_id DESC);  -- historial por jugador

-- Agregado materializado. Un GROUP BY sobre round_results va bien con mil
-- filas y es inservible con un millón: esto se actualiza incrementalmente en
-- el mismo batch que cierra la partida, nunca recalculando por escaneo.
CREATE TABLE user_stats (
  user_id        TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  races          INTEGER NOT NULL DEFAULT 0,
  matches        INTEGER NOT NULL DEFAULT 0,
  wins           INTEGER NOT NULL DEFAULT 0,
  podiums        INTEGER NOT NULL DEFAULT 0,
  dnf            INTEGER NOT NULL DEFAULT 0,
  best_wpm       REAL NOT NULL DEFAULT 0,
  sum_wpm        REAL NOT NULL DEFAULT 0,      -- media = sum_wpm / races
  sum_accuracy   REAL NOT NULL DEFAULT 0,
  chars_typed    INTEGER NOT NULL DEFAULT 0,
  time_ms        INTEGER NOT NULL DEFAULT 0,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX ix_stats_bestwpm ON user_stats(best_wpm DESC);
CREATE INDEX ix_stats_races   ON user_stats(races DESC);
CREATE INDEX ix_stats_wins    ON user_stats(wins DESC);

-- Ventana rodante. Consultar round_results por rango de fechas con GROUP BY no
-- se mantiene rápido; esto es una fila por jugador y día.
CREATE TABLE wpm_board_daily (
  day      TEXT NOT NULL,                     -- YYYY-MM-DD en UTC
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  best_wpm REAL NOT NULL,
  races    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, user_id)
);
CREATE INDEX ix_board_day ON wpm_board_daily(day, best_wpm DESC);
