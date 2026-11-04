import { readFileSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative, sep, isAbsolute } from 'node:path';

const requestedRoot = resolve(process.argv[2] ?? '.');
if (lstatSync(requestedRoot).isSymbolicLink()) throw new Error('Bundle root must not be a link');
const root = realpathSync(requestedRoot);
const key = path => process.platform === 'win32' ? path.toLowerCase() : path;
const expected = new Set([key('SHA256SUMS')]);
function regularFile(path) {
  // Reject links at every component before opening any manifest-controlled file.
  let target = root;
  for (const component of path.split('/')) {
    target = resolve(target, component);
    if (lstatSync(target).isSymbolicLink()) throw new Error(`Links are forbidden: ${path}`);
  }
  const inside = relative(root, realpathSync(target));
  if (!inside || isAbsolute(inside) || inside === '..' || inside.startsWith('..' + sep)) throw new Error(`Outside bundle: ${path}`);
  if (!lstatSync(target).isFile()) throw new Error(`Not a regular file: ${path}`);
  return target;
}
regularFile('SHA256SUMS');
for (const line of readFileSync(resolve(root, 'SHA256SUMS'), 'utf8').trimEnd().split('\n')) {
  const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
  if (!match) throw new Error('Malformed checksum line');
  const [, digest, path] = match;
  // The manifest uses portable, canonical relative paths only. Colons also
  // exclude Windows drive-relative paths and alternate data streams.
  if (/[\\:]/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)) || expected.has(key(path))) throw new Error(`Invalid or duplicate path: ${path}`);
  const target = regularFile(path);
  if (createHash('sha256').update(readFileSync(target)).digest('hex') !== digest) throw new Error(`Checksum mismatch: ${path}`);
  expected.add(key(path));
}
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const target = resolve(directory, entry.name);
    const path = relative(root, target).split(sep).join('/');
    if (entry.isDirectory()) walk(target);
    else if (!entry.isFile() || !expected.has(key(path))) throw new Error(`Unexpected file: ${path}`);
  }
}
walk(root);
console.log(`Verified ${expected.size - 1} files`);
