import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {expandCases} from './schema.mjs';
import {combineReports} from './aggregate.mjs';
import {auditFiles} from './privacy.mjs';
import {serverFailures} from './outcome.mjs';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const spec=JSON.parse(readFileSync(new URL('../../docs/acceptance/mockup-server-acceptance.json',import.meta.url),'utf8'));
const digest='wiremock/wiremock@sha256:'+'a'.repeat(64),commit='b'.repeat(40);
function report(){return {candidateCommit:commit,fixtureVersion:spec.fixtureModel.version,specSha256:createHash('sha256').update(readFileSync(new URL('../../docs/acceptance/mockup-server-acceptance.json',import.meta.url))).digest('hex'),imageDigest:digest,worktreeDirty:false,runId:'synthetic-unit',mode:'default',cycle:1,cases:expandCases(spec).map(c=>({expandedCaseId:c.id,target:c.target,required:c.required,status:'PASS',assertions:(c.expected.assertions??[]).map(text=>({text,status:'PASS'})),attempts:[{status:'PASS'}]}))};}
test('aggregation rejects missing rows, mixed candidates, incomplete assertion evidence and mutable source',()=>{
 const valid=report();assert.equal(combineReports(spec,[valid]).cases.length,91);
 for(const mutate of[r=>r.specSha256='c'.repeat(64),r=>r.cases.pop(),r=>r.worktreeDirty=true,r=>r.cases[0].assertions=[],r=>r.cases[0].assertions[0].status='NOT_RUN']){const changed=structuredClone(valid);mutate(changed);assert.throws(()=>combineReports(spec,[changed]));}
 const changedSpec=structuredClone(spec);changedSpec.schemas.jiraUser.required.push('newRequirement');assert.throws(()=>combineReports(changedSpec,[valid]));
 const other=report();other.candidateCommit='d'.repeat(40);assert.throws(()=>combineReports(spec,[valid,other]));
});
test('aggregation preserves failed attempts and never declares real consumer completion',()=>{
 const failed=report();failed.cases[0].status='FAIL';failed.cases[0].attempts=[{status:'FAIL'}];
 const passed=report();const result=combineReports(spec,[failed,passed]);assert.equal(result.cases[0].status,'PASS');assert.deepEqual(result.cases[0].attempts.map(a=>a.status),['FAIL','PASS']);
 assert.equal(result.completion.declared,false);assert.equal(result.gates.find(g=>g.gateId==='G-CONSUMER').status,'NOT_RUN');
});
test('private audit emits categories and paths, never matched denylist values',t=>{
 const dir=mkdtempSync(join(tmpdir(),'mockup-audit-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const forbidden='synthetic-private-value-for-negative-test';writeFileSync(join(dir,'deny.json'),JSON.stringify({terms:[forbidden]}));writeFileSync(join(dir,'sample.txt'),forbidden);
 const result=auditFiles(dir,['sample.txt'],{denylistFile:join(dir,'deny.json')});assert.equal(result.status,'FAIL');assert.equal(JSON.stringify(result).includes(forbidden),false);
 writeFileSync(join(dir,'sample.txt'),'C:'+'/Users/'+'mock-user/document');assert.equal(auditFiles(dir,['sample.txt']).status,'PASS');
 writeFileSync(join(dir,'sample.txt'),'C:'+'/Users/'+'not-a-mock/document');assert.equal(auditFiles(dir,['sample.txt']).status,'FAIL');
});


test('server-only cannot succeed when preflight fails but finally resets succeed',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'mockup-preflight-proof-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));let resets=0;
 const server=createServer((req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/__admin/scenarios/reset'){res.statusCode=++resets===1?500:200;res.end('{}');}else if(req.url==='/__admin/scenarios')res.end(JSON.stringify({scenarios:[{name:'product-read',state:'Started'}]}));else{res.statusCode=500;res.end('{}');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const base='http://127.0.0.1:'+server.address().port,output=join(dir,'report.json');
 const child=spawn(process.execPath,[fileURLToPath(new URL('./run.mjs',import.meta.url)),'--owned','--server-only','--output',output],{env:{...process.env,JIRA_BASE_URL:base,CONFLUENCE_BASE_URL:base},stdio:['ignore','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
 const actual=JSON.parse(readFileSync(output,'utf8'));assert.equal(actual.cases.length,91);assert.ok(actual.cases.every(c=>c.status==='BLOCKED'));assert.equal(actual.cleanupFailure,undefined);assert.ok(resets>=3);assert.equal(code,1);
});
test('server-only exemptions require actual evidence and only nonmatching contexts',()=>{
 const current={baseUrls:{jira:'http://127.0.0.1:8081'},cases:[{expandedCaseId:'M-CONTEXT-jira-',status:'NOT_RUN',assertions:[]}],snapshots:{}};
 assert.deepEqual(serverFailures(current,['M-CONTEXT-jira-']),['M-CONTEXT-jira-:NOT_RUN']);
 current.cases[0].expandedCaseId='M-CONTEXT-jira-/custom-context';assert.deepEqual(serverFailures(current,['M-CONTEXT-jira-/custom-context']),[]);
 current.cases=[{expandedCaseId:'O-REPEATABILITY',status:'BLOCKED',assertions:[],attempts:[]}];assert.ok(serverFailures(current,['O-REPEATABILITY']).length);
});
