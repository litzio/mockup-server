import test from 'node:test';
import assert from 'node:assert/strict';
import {selectRuntimePaths,runtimeFiles,runtimeDependencyPaths} from './bundle-scope.mjs';
const sources=[...runtimeFiles,'scripts/acceptance/run.mjs','scripts/acceptance/schema.mjs','scripts/acceptance/consumer.mjs',...['jira','confluence'].flatMap(p=>['mappings/a.json','__files/a.json','tests/a.test.mjs','tools/generate-v2.mjs'].map(s=>`services/${p}/${s}`))];
test('runtime export includes current contract and generator inputs, excludes historical evidence and credentials',()=>{
 const selected=selectRuntimePaths([...sources,'docs/evidence/issue14/raw.log.gz','docs/offline.md','.env','README.md','.git/config']);
 assert.deepEqual(selected,[...sources].sort());
 assert.throws(()=>selectRuntimePaths(sources.filter(p=>p!=='docs/acceptance/mockup-server-acceptance.json')));
 assert.throws(()=>selectRuntimePaths(sources.filter(p=>!p.startsWith('services/jira/mappings/'))));
});
test('runtime schema validator dependency closure includes licenses and pinned installed versions',()=>{
 const files=runtimeDependencyPaths(process.cwd());assert.ok(files.includes('node_modules/ajv/dist/ajv.js'));assert.ok(files.includes('node_modules/ajv/LICENSE'));
 assert.ok(files.some(p=>p.startsWith('node_modules/fast-uri/')));assert.ok(!files.some(p=>p.startsWith('node_modules/js-yaml/')));
});
