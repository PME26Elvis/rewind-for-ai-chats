import { readFileSync } from 'node:fs';

const migrationFile = new URL('../migrations/001_initial_schema.sql', import.meta.url);

export const SQLITE_MIGRATIONS = [
  {
    version: '001_initial_schema',
    description: 'Create canonical archive tables, indexes, and schema migration registry.',
    sql: readFileSync(migrationFile, 'utf8')
  }
];

export const SIDECAR_LAYOUT = {
  databaseFile: 'rewind.sqlite',
  rawJsonDir: 'raw/json',
  rawHtmlDir: 'raw/html',
  reportsDir: 'reports'
};
