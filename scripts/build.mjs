import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(rootDir, 'dist');

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

for (const relativePath of ['apps/web/index.html', 'apps/web/src', 'packages']) {
  const source = join(rootDir, relativePath);
  if (existsSync(source)) {
    cpSync(source, join(distDir, relativePath), { recursive: true });
  }
}

writeFileSync(
  join(distDir, 'README.txt'),
  [
    'Build output for the runnable scaffold.',
    'Serve the dist directory from the repository root, for example:',
    '  python3 -m http.server 4173 --directory dist',
    'Then open http://localhost:4173/apps/web/'
  ].join('\n')
);

console.log(`Built runnable scaffold into ${distDir}`);
