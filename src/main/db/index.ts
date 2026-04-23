import Database from 'better-sqlite3'
import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'

export let db: Database.Database

export function initDb() {
  const dir = path.join(app.getPath('userData'), 'data')
  fs.mkdirSync(dir, { recursive: true })
  db = new Database(path.join(dir, 'transcripts.db'))
  db.pragma('journal_mode = WAL')
  db.exec(SCHEMA)
}

const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS sessions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  started_at   TEXT NOT NULL,
  ended_at     TEXT,
  duration_ms  INTEGER DEFAULT 0,
  language     TEXT NOT NULL DEFAULT 'auto'
);

CREATE TABLE IF NOT EXISTS segments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  speaker_id  TEXT,
  start_ms    INTEGER NOT NULL,
  end_ms      INTEGER NOT NULL,
  text        TEXT NOT NULL,
  is_final    INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_segments_session ON segments(session_id);

-- FTS5 仮想テーブル（全文検索）
CREATE VIRTUAL TABLE IF NOT EXISTS segments_fts USING fts5(
  text,
  content='segments',
  content_rowid='id',
  tokenize='unicode61 remove_diacritics 2'
);

-- segments への変更を FTS5 に同期するトリガ
CREATE TRIGGER IF NOT EXISTS segments_ai AFTER INSERT ON segments BEGIN
  INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS segments_ad AFTER DELETE ON segments BEGIN
  INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER IF NOT EXISTS segments_au AFTER UPDATE ON segments BEGIN
  INSERT INTO segments_fts(segments_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO segments_fts(rowid, text) VALUES (new.id, new.text);
END;

PRAGMA foreign_keys = ON;
`
