CREATE TABLE IF NOT EXISTS tasks (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT REFERENCES tasks(id) ON DELETE SET NULL,
    title       TEXT NOT NULL,
    cli_type    TEXT NOT NULL,
    command     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    exit_code   INTEGER,
    created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS node_positions (
    task_id     TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    pos_x       REAL NOT NULL DEFAULT 0,
    pos_y       REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS edges (
    id          TEXT PRIMARY KEY,
    source_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    target_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks(parent_id);
CREATE INDEX IF NOT EXISTS idx_edges_source_id ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target_id ON edges(target_id);
