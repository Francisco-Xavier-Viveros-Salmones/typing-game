-- Corpus de frases. Las tablas de identidad, partidas y ranked llegan en
-- migraciones posteriores (fases 3, 5 y 7): esta solo cubre lo que la fase 2 usa.

-- Se crea antes que `phrases` porque esta la referencia.
CREATE TABLE phrase_gen_runs (
  id             TEXT PRIMARY KEY,
  started_at     INTEGER NOT NULL,
  finished_at    INTEGER,
  model          TEXT NOT NULL,
  requested      INTEGER NOT NULL DEFAULT 0,
  accepted       INTEGER NOT NULL DEFAULT 0,
  rejected       INTEGER NOT NULL DEFAULT 0,
  reject_reasons TEXT,          -- JSON {razón: cuenta}
  error          TEXT
);

CREATE TABLE phrases (
  id           TEXT PRIMARY KEY,          -- ULID
  lang         TEXT NOT NULL CHECK (lang IN ('es','en')),
  category     TEXT NOT NULL CHECK (category IN ('historia','ciencia','tecnologia','geografia')),
  difficulty   TEXT NOT NULL CHECK (difficulty IN ('facil','normal','dificil')),
  text         TEXT NOT NULL,
  text_hash    TEXT NOT NULL,            
  char_len     INTEGER NOT NULL,
  word_count   INTEGER NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('seed','gemini','manual')),
  model        TEXT,
  gen_run_id   TEXT REFERENCES phrase_gen_runs(id) ON DELETE SET NULL,
  active       INTEGER NOT NULL DEFAULT 1,
  needs_review INTEGER NOT NULL DEFAULT 0,
  times_used   INTEGER NOT NULL DEFAULT 0,
  reports      INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL
);

-- Árbitro final del dedupe: la validación previa es una optimización, esto es la garantía.
CREATE UNIQUE INDEX ux_phrases_hash ON phrases(text_hash);

-- Sirve la selección: filtra por cubo y ordena por uso, para repartir el
-- desgaste y no tener que recurrir a ORDER BY RANDOM() cuando la tabla crezca.
CREATE INDEX ix_phrases_pick ON phrases(lang, category, difficulty, active, times_used);
