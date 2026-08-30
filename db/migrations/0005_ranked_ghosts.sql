-- Temporadas, Elo y fantasmas.

CREATE TABLE seasons (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  starts_at       INTEGER NOT NULL,
  ends_at         INTEGER NOT NULL,
  state           TEXT NOT NULL CHECK (state IN ('upcoming','active','rolling_over','closed')),
  -- Último usuario procesado del cierre. D1 no tiene transacciones largas ni
  -- aguanta 30 s por sentencia, así que el cierre va por páginas con cursor.
  rollover_cursor TEXT
);
CREATE INDEX ix_seasons_state ON seasons(state, starts_at);

CREATE TABLE elo_ratings (
  season_id       TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL DEFAULT 1200,
  peak_rating     INTEGER NOT NULL DEFAULT 1200,
  matches_played  INTEGER NOT NULL DEFAULT 0,
  wins            INTEGER NOT NULL DEFAULT 0,
  podiums         INTEGER NOT NULL DEFAULT 0,
  placements_left INTEGER NOT NULL DEFAULT 10,
  updated_at      INTEGER NOT NULL,
  PRIMARY KEY (season_id, user_id)
);
-- La ladder es índice puro: elo_ratings ya es una fila por jugador.
CREATE INDEX ix_elo_board ON elo_ratings(season_id, placements_left, rating DESC);

CREATE TABLE elo_history (
  id         TEXT PRIMARY KEY,
  season_id  TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  match_id   TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  before     INTEGER NOT NULL,
  after      INTEGER NOT NULL,
  delta      INTEGER NOT NULL,
  k_factor   INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
-- Guard de doble aplicación: se inserta PRIMERO en el batch, así que un
-- reintento choca contra el índice y aborta la transacción entera.
CREATE UNIQUE INDEX ux_elo_hist_idem ON elo_history(match_id, user_id);
CREATE INDEX ix_elo_hist_user ON elo_history(user_id, created_at DESC);

CREATE TABLE season_final_standings (
  season_id TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rank      INTEGER NOT NULL,
  rating    INTEGER NOT NULL,
  matches   INTEGER NOT NULL,
  PRIMARY KEY (season_id, user_id)
);

CREATE TABLE ghosts (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phrase_id   TEXT NOT NULL REFERENCES phrases(id) ON DELETE CASCADE,
  lang        TEXT NOT NULL,
  difficulty  TEXT NOT NULL,
  wpm         REAL NOT NULL,
  accuracy    REAL NOT NULL,
  errors      INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  format      INTEGER NOT NULL DEFAULT 1,
  -- ~500 bytes. En D1 y no en R2 (un round trip extra para menos de lo que
  -- ocupan las cabeceras HTTP) ni en KV (no sabe ORDER BY wpm).
  data        BLOB NOT NULL,
  byte_len    INTEGER NOT NULL,
  is_pb       INTEGER NOT NULL DEFAULT 0,
  visibility  TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  created_at  INTEGER NOT NULL
);
-- Un único récord personal por jugador y frase.
CREATE UNIQUE INDEX ux_ghost_pb ON ghosts(user_id, phrase_id) WHERE is_pb = 1;
CREATE INDEX ix_ghost_phrase_top ON ghosts(phrase_id, wpm DESC) WHERE visibility = 'public';
CREATE INDEX ix_ghost_user ON ghosts(user_id, created_at DESC);
