import { readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = resolve(directory, entry.name);
    if (entry.isDirectory()) { await check(file); continue; }
    if (!file.endsWith('.js')) continue;
    const syntax = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (syntax.status !== 0) throw new Error(syntax.stderr);
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*)['"]([^'"]+)['"]/g)) {
      const name = match[1];
      if (name === 'sdk' || name.startsWith('sdk/')) continue;
      if (!name.startsWith('.') || !name.endsWith('.js') || relative(resolve('tgcloud'), resolve(dirname(file), name)).startsWith('..')) throw new Error(`Invalid runtime import: ${file}: ${name}`);
    }
    if (/\b(?:process|Buffer|require)\b/.test(source)) throw new Error(`Node API in Serverless: ${file}`);
  }
}
await check(resolve('tgcloud'));
try {
  await readFile(resolve('tgcloud/endpoints/chipperV02ResetTemporary.js'));
  throw new Error('Temporary administrative reset endpoint must never be deployed');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
console.log('Serverless modules: syntax and runtime imports PASS');
