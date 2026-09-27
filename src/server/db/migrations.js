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
  return true;
}

if (process.argv[1] === __filename) {
  const db = getDatabase();
  runMigrations(db);
  console.log('Migrations applied successfully.');
}
