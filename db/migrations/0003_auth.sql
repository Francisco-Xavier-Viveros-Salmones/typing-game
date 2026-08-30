-- Identidad. Las sesiones son opacas y viven en la base: un token firmado sin
-- estado no se puede revocar (ban, cambio de contraseña, "cerrar sesión en
-- todas partes"), y firmar no aporta nada sobre 256 bits de entropía.

CREATE TABLE users (
  id             TEXT PRIMARY KEY,             -- ULID
  username       TEXT NOT NULL,                -- tal cual lo escribió, para mostrar
  username_norm  TEXT NOT NULL,                -- NFKC + minúsculas: la clave de unicidad
  password_hash  BLOB NOT NULL,                -- 32 bytes de PBKDF2
  password_salt  BLOB NOT NULL,                -- 16 bytes aleatorios, uno por usuario
  kdf            TEXT NOT NULL DEFAULT 'pbkdf2-sha256',
  kdf_iterations INTEGER NOT NULL,             -- guardado por fila: permite subirlo y rehashear al entrar
  color          TEXT,
  locale         TEXT NOT NULL DEFAULT 'es',
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  flags          INTEGER NOT NULL DEFAULT 0,   -- bits: 1=sospechoso, 2=chat silenciado
  banned_until   INTEGER,
  created_at     INTEGER NOT NULL,
  last_seen_at   INTEGER NOT NULL,
  deleted_at     INTEGER
);

CREATE UNIQUE INDEX ux_users_norm ON users(username_norm);

CREATE TABLE sessions (
  -- hex(sha256(token)). El token en claro nunca se guarda: un volcado de la
  -- base no entrega sesiones utilizables.
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  expires_at   INTEGER NOT NULL,
  last_used_at INTEGER NOT NULL,
  ua_hash      TEXT,                            -- señal blanda de anomalía, no se usa para autorizar
  ip_cc        TEXT                             -- cf.country, nunca la IP
);

CREATE INDEX ix_sessions_user    ON sessions(user_id);
CREATE INDEX ix_sessions_expires ON sessions(expires_at);   -- recolección por cron

-- Cubos de fuerza bruta. Se lleva uno por usuario y otro por IP: solo por IP
-- deja pasar el ataque distribuido, y solo por usuario permite barrer cuentas.
CREATE TABLE auth_throttle (
  key          TEXT PRIMARY KEY,               -- 'u:<username_norm>' o 'ip:<hash>'
  fails        INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL,
  locked_until INTEGER
);
