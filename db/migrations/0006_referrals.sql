-- Referidos. Se guarda en la propia fila del usuario en vez de en una tabla
-- aparte: es un dato por usuario, inmutable, y así el alta sigue siendo un
-- único INSERT.
ALTER TABLE users ADD COLUMN referred_by TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX ix_users_referrer ON users(referred_by);
