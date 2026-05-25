-- Agrega columna ical_uid para identificar reservas importadas de Airbnb
ALTER TABLE reservas ADD COLUMN IF NOT EXISTS ical_uid TEXT UNIQUE;

-- Índice para acelerar upserts por ical_uid
CREATE INDEX IF NOT EXISTS reservas_ical_uid_idx ON reservas (ical_uid);
