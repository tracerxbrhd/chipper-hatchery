import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const patterns = [
  /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/,
  /\bapp\d+:[A-Za-z0-9_-]{20,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 10_000_000 });
const files = git(['ls-files', '--cached', '--others', '--exclude-standard']).trim().split('\n').filter(Boolean);
const failures = [];
for (const file of files) {
  if (/\.(?:png|jpe?g|webp|gif|pdf|zip)$/i.test(file)) continue;
  const text = await readFile(file, 'utf8');
  if (patterns.some(pattern => pattern.test(text))) failures.push(file);
}
// Inspect every committed version as well; print paths only, never matched values.
const commits = git(['rev-list', 'HEAD']).trim().split('\n');
for (const sha of commits) {
  for (const file of git(['ls-tree', '-r', '--name-only', sha]).trim().split('\n')) {
    if (!file || /\.(?:png|jpe?g|webp|gif|pdf|zip)$/i.test(file)) continue;
    const text = git(['show', `${sha}:${file}`]);
    if (patterns.some(pattern => pattern.test(text))) failures.push(`${sha.slice(0, 8)}:${file}`);
  }
}
if (failures.length) throw new Error(`Potential secrets detected in: ${[...new Set(failures)].join(', ')}`);
console.log(`Secret patterns: PASS (${files.length} files, ${commits.length} commits). No credential directories read.`);
