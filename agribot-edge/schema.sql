-- AGRI-PC edge database schema (Postgres)
-- Mirrors the SensorSnapshot shape used by the app: { ts, espIP, data }.

CREATE TABLE IF NOT EXISTS sensor_readings (
    id      BIGSERIAL PRIMARY KEY,
    ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
    esp_ip  TEXT,
    data    JSONB       NOT NULL,
    synced  BOOLEAN     NOT NULL DEFAULT FALSE   -- pushed to Supabase yet?
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_ts
    ON sensor_readings (ts DESC);

-- Partial index keeps the sync agent's "what's left to push" scan cheap.
CREATE INDEX IF NOT EXISTS idx_sensor_readings_unsynced
    ON sensor_readings (id) WHERE synced = FALSE;

CREATE TABLE IF NOT EXISTS command_log (
    id       BIGSERIAL PRIMARY KEY,
    ts       TIMESTAMPTZ NOT NULL DEFAULT now(),
    source   TEXT,                 -- 'phone' | 'gyro' | ...
    command  TEXT NOT NULL,        -- 'M100,100' | 'S' | 'CU' ...
    mode     TEXT                  -- 'online' | 'offline'
);
