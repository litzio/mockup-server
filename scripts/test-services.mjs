import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

const files = readdirSync('services').flatMap(service =>
  readdirSync('services/' + service + '/tests')
    .filter(file => file.endsWith('.test.mjs'))
    .map(file => 'services/' + service + '/tests/' + file));
if (!files.length) throw new Error('No service tests found');
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
