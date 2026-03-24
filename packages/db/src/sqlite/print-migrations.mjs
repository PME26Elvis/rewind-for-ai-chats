import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = new URL('../migrations/', import.meta.url);

for (const file of readdirSync(migrationsDir).filter((entry) => entry.endsWith('.sql')).sort()) {
  const fullPath = join(migrationsDir.pathname, file);
  console.log(`-- ${file} --`);
  console.log(readFileSync(fullPath, 'utf8'));
}
