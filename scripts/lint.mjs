import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));

assert.equal(packageJson.packageManager, 'npm@10.8.2', 'packageManager must stay pinned.');
assert.ok(Array.isArray(packageJson.workspaces) && packageJson.workspaces.length > 0, 'workspaces must be configured.');

const workflowPath = join(rootDir, '.github/workflows/ci.yml');
assert.ok(existsSync(workflowPath), 'CI workflow is required.');

const packagesDir = join(rootDir, 'packages');
for (const entry of readdirSync(packagesDir, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
  const packagePath = join(packagesDir, entry.name, 'package.json');
  assert.ok(existsSync(packagePath), `Missing package.json for ${entry.name}.`);
  const packageDefinition = JSON.parse(readFileSync(packagePath, 'utf8'));
  assert.equal(packageDefinition.version, '0.1.0', `${entry.name} version must stay pinned to 0.1.0.`);
}

const appHtml = readFileSync(join(rootDir, 'apps/web/index.html'), 'utf8');
assert.match(appHtml, /src="\/src\/main\.js"/, 'Web entrypoint must load the runnable JS module.');

console.log('Lint checks passed.');
