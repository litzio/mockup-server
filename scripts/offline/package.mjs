import { spawnSync } from 'node:child_process';
import { mkdirSync, copyFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { selectRuntimePaths, runtimeDependencyPaths } from './bundle-scope.mjs';
import { auditFiles } from '../acceptance/privacy.mjs';

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}
const root = run('git', ['rev-parse', '--show-toplevel']);
process.chdir(root);
const destination = resolve(process.argv[2] ?? '');
if (!process.argv[2] || existsSync(destination)) throw new Error('Supply a new destination outside the repository');
if (!relative(root, destination).startsWith('..' + sep)) throw new Error('Destination must be outside the repository');
if (run('git', ['status', '--porcelain'])) throw new Error('Commit all source changes before packaging');
const commit = run('git', ['rev-parse', 'HEAD']);
const image = 'wiremock/wiremock:3.13.2';
const toolImage = 'docker:29.7.2-dind';
run('docker', ['pull', '--platform', 'linux/amd64', image]);
run('docker', ['pull', '--platform', 'linux/amd64', toolImage]);
const metadata = JSON.parse(run('docker', ['image', 'inspect', image]))[0];
const toolMetadata = JSON.parse(run('docker', ['image', 'inspect', toolImage]))[0];
if (metadata.Os !== 'linux' || metadata.Architecture !== 'amd64') throw new Error('Unexpected image platform');
if (toolMetadata.Os !== 'linux' || toolMetadata.Architecture !== 'amd64') throw new Error('Unexpected tool image platform');
mkdirSync(destination, { recursive: true });
const tracked = run('git', ['ls-files', '-z']).split('\0').filter(Boolean);
const privacyAudit = auditFiles(root, tracked, {denylistFile: process.env.MOCKUP_PRIVACY_DENYLIST});
if (privacyAudit.status !== 'PASS') throw new Error('Source privacy audit failed: ' + JSON.stringify(privacyAudit.findings));
const paths = [...selectRuntimePaths(tracked), ...runtimeDependencyPaths(root)];
const excludedTrackedPaths = tracked.filter(path => !paths.includes(path));
for (const path of paths) {
  mkdirSync(dirname(resolve(destination, path)), { recursive: true });
  if (path.startsWith('node_modules/')) copyFileSync(path, resolve(destination, path));
  else writeFileSync(resolve(destination, path), readFileSync(path, 'utf8').replaceAll('\r\n', '\n'));
}
run('docker', ['image', 'save', '--output', resolve(destination, 'wiremock.tar'), image]);
paths.push('wiremock.tar');
run('docker', ['image', 'save', '--output', resolve(destination, 'dind.tar'), toolImage]);
paths.push('dind.tar');
writeFileSync(resolve(destination, 'bundle.json'), JSON.stringify({
  formatVersion: 2, sourceCommit: commit, fixtureVersion: 'synthetic-acceptance-v1', privacyAudit,
  sourceTextNormalization: 'First-party runtime UTF-8 text uses LF; dependency bytes and licenses are copied unchanged. Git source content and bundled normalized hashes identify the runtime.',
  exportScope: 'Curated current runtime, contract and pinned schema validator dependencies; historical evidence is excluded',
  includedSourcePaths: paths.filter(path => !path.endsWith('.tar')), excludedTrackedPaths,
  image, imageId: metadata.Id,
  repoDigests: metadata.RepoDigests, platform: 'linux/amd64',
  toolImage, toolImageId: toolMetadata.Id, toolRepoDigests: toolMetadata.RepoDigests,
  preparedAt: new Date().toISOString(), node: process.version,
  docker: run('docker', ['version', '--format', '{{.Client.Version}}']),
  compose: run('docker', ['compose', 'version', '--short']),
}, null, 2) + '\n');
paths.push('bundle.json');
writeFileSync(resolve(destination, 'SHA256SUMS'), paths.sort().map(path =>
  `${createHash('sha256').update(readFileSync(resolve(destination, path))).digest('hex')}  ${path.replaceAll('\\', '/')}`
).join('\n') + '\n');
console.log(`Prepared ${destination} from ${commit}. Offline acceptance has NOT been run.`);
