import initialSchema from '../migrations/001_initial_schema.sql?raw';

export interface MigrationDefinition {
  version: string;
  description: string;
  sql: string;
}

export const SQLITE_MIGRATIONS: MigrationDefinition[] = [
  {
    version: '001_initial_schema',
    description: 'Create canonical archive tables, indexes, and schema migration registry.',
    sql: initialSchema
  }
];

export const SIDECAR_LAYOUT = {
  databaseFile: 'rewind.sqlite',
  rawJsonDir: 'raw/json',
  rawHtmlDir: 'raw/html',
  reportsDir: 'reports'
} as const;
