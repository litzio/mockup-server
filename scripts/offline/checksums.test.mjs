import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const script = resolve('scripts/offline/checksums.mjs');
const digest = createHash('sha256').update('fixture').digest('hex');
function fixture(t) {
  const temp = mkdtempSync(join(tmpdir(), 'mockup-checksums-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const root = join(temp, 'bundle');
  mkdirSync(root);
  writeFileSync(join(root, 'data.txt'), 'fixture');
  writeFileSync(join(temp, 'outside.txt'), 'fixture');
  return { temp, root };
}
function check(root, paths) {
  writeFileSync(join(root, 'SHA256SUMS'), paths.map(path => `${digest}  ${path}`).join('\n') + '\n');
  return spawnSync(process.execPath, [script, root], { encoding: 'utf8' });
}
test('complete bundle succeeds; corruption, missing and extra files fail', t => {
  const { root } = fixture(t);
  assert.equal(check(root, ['data.txt']).status, 0);
  writeFileSync(join(root, 'data.txt'), 'corrupt');
  assert.match(check(root, ['data.txt']).stderr, /Checksum mismatch/);
  writeFileSync(join(root, 'data.txt'), 'fixture');
  assert.match(check(root, ['missing.txt']).stderr, /ENOENT/);
  writeFileSync(join(root, 'extra.txt'), 'fixture');
  assert.match(check(root, ['data.txt']).stderr, /Unexpected file/);
});
for (const path of ['../outside.txt', '/outside.txt', 'D:\\outside.txt', 'D:/outside.txt', 'D:outside.txt', '//server/share/file', 'data.txt:stream', './data.txt', 'sub/../data.txt', 'sub//data.txt', 'data.txt.', 'data.txt ']) {
  test(`reject manifest path before reading: ${path}`, t => {
    const { root } = fixture(t);
    const result = check(root, ['data.txt', path]);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Invalid or duplicate path/);
    assert.doesNotMatch(result.stderr, /ENOENT|Checksum mismatch/);
  });
}
test('reject duplicate canonical path', t => {
  const { root } = fixture(t);
  assert.match(check(root, ['data.txt', 'data.txt']).stderr, /Invalid or duplicate/);
  if (process.platform === 'win32') assert.match(check(root, ['data.txt', 'DATA.TXT']).stderr, /Invalid or duplicate/);
});
test('reject directory junction escaping to matching external data', t => {
  const { temp, root } = fixture(t);
  const outside = join(temp, 'external');
  mkdirSync(outside);
  writeFileSync(join(outside, 'secret.txt'), 'fixture');
  symlinkSync(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.match(check(root, ['data.txt', 'linked/secret.txt']).stderr, /Links are forbidden/);
});
test('reject linked bundle root before reading manifest', t => {
  const { temp, root } = fixture(t);
  check(root, ['data.txt']);
  const linkedRoot = join(temp, 'linked-root');
  symlinkSync(root, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  assert.match(spawnSync(process.execPath, [script, linkedRoot], { encoding: 'utf8' }).stderr, /Bundle root must not be a link/);
});
