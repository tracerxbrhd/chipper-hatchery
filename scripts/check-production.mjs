import { readFile, readdir } from 'node:fs/promises';

const forbidden = ['chipper-explicit-development-v1', 'chipper-explicit-development-v2', 'chipper-art-gallery-v2', 'Development adapter cannot run', 'createInitialState', 'signed-A'];
for (const filename of await readdir('dist/assets')) {
  if (!filename.endsWith('.js')) continue;
  const source = await readFile(`dist/assets/${filename}`, 'utf8');
  if (forbidden.some(marker => source.includes(marker))) throw new Error(`Development code leaked into production bundle: ${filename}`);
}
console.log('Production bundle: development backend and test identities excluded PASS');
