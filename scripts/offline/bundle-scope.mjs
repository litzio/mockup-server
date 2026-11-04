import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join,relative,sep} from 'node:path';
export const runtimeFiles=[
 'compose.yaml','compose.context.yaml','.env.example','package.json','package-lock.json',
 'scripts/prepare-context.mjs','scripts/test-services.mjs','scripts/wait-services.mjs','scripts/check-context.mjs',
 'scripts/offline/checksums.mjs','scripts/offline/state.mjs','scripts/offline/verify-isolated.ps1',
 'docs/acceptance/mockup-server-acceptance.json','docs/acceptance/mockup-server-acceptance.md','docs/acceptance/provenance.md','docs/offline-v2.md',
];
export function selectRuntimePaths(tracked){
 const chosen=tracked.filter(path=>runtimeFiles.includes(path)||/^services\/(jira|confluence)\/(mappings|__files|tests|tools)\//.test(path)||/^tests\/helpers\//.test(path)||/^scripts\/acceptance\//.test(path)||/^services\/(jira|confluence)\/api-support\.md$/.test(path));
 for(const file of runtimeFiles)assert.ok(chosen.includes(file),'Missing required runtime file: '+file);
 for(const product of['jira','confluence'])for(const folder of['mappings','__files','tests'])assert.ok(chosen.some(p=>p.startsWith(`services/${product}/${folder}/`)),'Missing product runtime: '+product+'/'+folder);
 assert.ok(chosen.includes('scripts/acceptance/run.mjs'));assert.ok(chosen.includes('scripts/acceptance/schema.mjs'));assert.ok(chosen.includes('scripts/acceptance/consumer.mjs'));
 return chosen.sort();
}
export function runtimeDependencyPaths(root){
 const lock=JSON.parse(readFileSync(join(root,'package-lock.json'),'utf8'));
 const names=new Set();
 function add(name){if(names.has(name))return;names.add(name);const entry=lock.packages['node_modules/'+name];assert.ok(entry,'Missing locked dependency '+name);const installed=JSON.parse(readFileSync(join(root,'node_modules',name,'package.json'),'utf8'));assert.equal(installed.version,entry.version,'Installed/locked dependency mismatch '+name);for(const child of Object.keys(entry.dependencies??{}))add(child);}
 add('ajv');const paths=[];
 for(const name of names){const packageRoot=join(root,'node_modules',name);let license=false;
  function walk(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);assert.equal(lstatSync(path).isSymbolicLink(),false,'Dependency symlink not allowed');if(entry.isDirectory())walk(path);else{assert.ok(entry.isFile());if(/^licen[sc]e/i.test(entry.name))license=true;paths.push(relative(root,path).split(sep).join('/'));}}}
  walk(packageRoot);assert.ok(license,'Preserve upstream license: '+name);
 }
 return paths.sort();
}
