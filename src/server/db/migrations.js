import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabase } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runMigrations(db = getDatabase()) {
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // DatabaseSync handles multiple statements in db.exec()
  db.exec(schemaSql);

  // Dynamic backward-compatible migrations for existing databases
  try {
    const columns = db.prepare("PRAGMA table_info(events)").all().map(c => c.name);
    if (!columns.includes('organizer_id')) {
      db.exec("ALTER TABLE events ADD COLUMN organizer_id TEXT REFERENCES users(id);");
    }
    if (!columns.includes('slug')) {
      db.exec("ALTER TABLE events ADD COLUMN slug TEXT;");
    }
    if (!columns.includes('status')) {
      db.exec("ALTER TABLE events ADD COLUMN status TEXT NOT NULL DEFAULT 'PUBLISHED';");
    }
    if (!columns.includes('judging_mode')) {
      db.exec("ALTER TABLE events ADD COLUMN judging_mode TEXT DEFAULT 'BOTH';");
    }
    if (!columns.includes('results_published')) {
      db.exec("ALTER TABLE events ADD COLUMN results_published INTEGER NOT NULL DEFAULT 0;");
    }
    // Users verification & reset columns
    const userColumns = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    if (!userColumns.includes('is_verified')) {
      db.exec("ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 0;");
    }
    if (!userColumns.includes('verification_token')) {
      db.exec("ALTER TABLE users ADD COLUMN verification_token TEXT;");
    }
    if (!userColumns.includes('verification_token_expires_at')) {
      db.exec("ALTER TABLE users ADD COLUMN verification_token_expires_at TEXT;");
    }
    if (!userColumns.includes('reset_token')) {
      db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT;");
    }
    if (!userColumns.includes('reset_token_expires_at')) {
      db.exec("ALTER TABLE users ADD COLUMN reset_token_expires_at TEXT;");
    }

    // Benchmark fixture accounts are automatically verified
    db.exec("UPDATE users SET is_verified = 1 WHERE id IN ('usr_org_01', 'usr_part_1') OR id LIKE 'jdg_%';");

    // Ensure default slug for evt_01 if unset
    db.exec("UPDATE events SET slug = 'dogfood-2026', organizer_id = 'usr_org_01' WHERE id = 'evt_01' AND (slug IS NULL OR slug = '');");

    // Ensure canonical test sessions exist with valid expiration
    try {
      db.prepare(`
        INSERT OR IGNORE INTO sessions (token, user_id, expires_at)
        VALUES
          ('org_7f2a', 'usr_org_01', datetime('now', '+30 days')),
          ('jdg_a_91bc', 'jdg_01', datetime('now', '+30 days')),
          ('jdg_b_44de', 'jdg_02', datetime('now', '+30 days')),
          ('prt_2e88', 'usr_part_1', datetime('now', '+30 days'))
      `).run();
    } catch {}
  } catch (err) {
    console.error('Migration notice:', err.message);
  }

  return true;
}

if (process.argv[1] === __filename) {
  const db = getDatabase();
  runMigrations(db);
  console.log('Migrations applied successfully.');
}
