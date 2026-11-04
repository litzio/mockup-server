import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {auditFiles,walkFiles,sha256} from './privacy.mjs';
const args=process.argv.slice(2),option=key=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
const source=resolve(option('--source')??'.'),bundleRoot=option('--bundle'),evidenceRoot=option('--evidence'),output=option('--output');assert.ok(bundleRoot&&evidenceRoot&&output);assert.equal(existsSync(output),false);
const bundle=JSON.parse(readFileSync(resolve(bundleRoot,'bundle.json'),'utf8'));
for(const path of bundle.includedSourcePaths){const sourceBytes=readFileSync(resolve(source,path));const comparable=path.startsWith('node_modules/')?sourceBytes:Buffer.from(sourceBytes.toString('utf8').replaceAll('\r\n','\n'));assert.equal(sha256(comparable),sha256(readFileSync(resolve(bundleRoot,path))),'Runtime/source drift: '+path);}
const sourceFiles=execFileSync('git',['-C',source,'ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const config={denylistFile:option('--denylist')};
const scopes={source:auditFiles(source,sourceFiles,config),bundle:auditFiles(bundleRoot,walkFiles(bundleRoot),config),evidence:auditFiles(evidenceRoot,walkFiles(evidenceRoot),config)};
const result={candidateCommit:bundle.sourceCommit,fixtureVersion:bundle.fixtureVersion,status:Object.values(scopes).every(s=>s.status==='PASS')?'PASS':'FAIL',runtimeMatches:true,sourceComparison:'First-party text compared as UTF-8 LF per bundle policy; upstream dependency bytes compared exactly',scopes,upstream:{imageId:bundle.imageId,imageDigest:bundle.repoDigests,dependencyLockSha256:sha256(readFileSync(resolve(bundleRoot,'package-lock.json')))},historicalEvidence:'Current tracked derivatives are labeled with original/current hashes; Git history is not exported.'};
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({status:result.status,scopes:Object.fromEntries(Object.entries(scopes).map(([k,v])=>[k,{status:v.status,files:v.inspectedFiles,findings:v.findings}]))}));process.exitCode=result.status==='PASS'?0:1;
