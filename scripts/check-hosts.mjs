import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const roots = ['packages/core', 'packages/react-native', 'packages/harness'];
const banned = [/from ['"]expo['"]/, /from ['"]expo\//, /require\(['"]expo['"]/];

async function walk(dir, files = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full, files);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry.name)) files.push(full);
  }
  return files;
}

const failures = [];
for (const root of roots) {
  const files = await walk(root);
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const pattern of banned) {
      if (pattern.test(text)) failures.push(`${file} imports Expo`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Host check passed: core, react-native, and harness do not import Expo.');
