import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {expandCases} from './schema.mjs';
export function combineReports(spec,reports,{lifecycle,audit,commandEvidence}={}){
 assert.ok(reports.length);const canonicalBytes=readFileSync(new URL('../../docs/acceptance/mockup-server-acceptance.json',import.meta.url));assert.deepEqual(spec,JSON.parse(canonicalBytes),'Aggregation requires the current canonical spec');const canonicalDigest=createHash('sha256').update(canonicalBytes).digest('hex');const expected=expandCases(spec),ids=expected.map(c=>c.id).sort();
 for(const report of reports){assert.equal(report.candidateCommit,reports[0].candidateCommit);assert.equal(report.fixtureVersion,spec.fixtureModel.version);assert.equal(report.specSha256,canonicalDigest,'Stale specification evidence');assert.equal(report.imageDigest,reports[0].imageDigest);assert.match(report.imageDigest,/@sha256:[a-f0-9]{64}$/);assert.deepEqual(report.cases.map(c=>c.expandedCaseId).sort(),ids);assert.equal(report.worktreeDirty,false,'Final reports require an immutable source');for(const c of report.cases){assert.ok(['PASS','FAIL','BLOCKED','NOT_RUN','SKIPPED'].includes(c.status));const definition=expected.find(e=>e.id===c.expandedCaseId);assert.deepEqual(c.assertions.map(a=>a.text),definition.expected.assertions??[]);if(c.status==='PASS')assert.ok(c.assertions.every(a=>a.status==='PASS'),'PASS case has unverified assertions');}}
 const final={...reports[0],runId:undefined,mode:'aggregate',cycle:undefined,reportRuns:reports.map(r=>({runId:r.runId,mode:r.mode,cycle:r.cycle})),cases:[]};
 for(const definition of expected){
  const attempts=reports.flatMap(r=>r.cases.filter(c=>c.expandedCaseId===definition.id));
  const performed=attempts.filter(c=>!['NOT_RUN','SKIPPED'].includes(c.status));
  const chosen=performed.at(-1)??attempts.at(-1);
  const merged={...chosen,attempts:attempts.flatMap(c=>c.attempts)};
  // A later deployment's nonapplicable context does not erase earlier evidence.
  final.cases.push(merged);
 }
 const find=id=>final.cases.find(c=>c.expandedCaseId===id);
 const mark=(id,status,summary)=>{const c=find(id);c.status=status;c.actualSanitizedSummary=summary;c.limitation=status==='PASS'?null:summary;c.assertions=c.assertions.map(a=>({...a,status}));c.attempts.push({runId:'aggregate',status,observations:[{summary}]});};
 if(lifecycle){
  assert.ok(commandEvidence,'Lifecycle requires structured actual command evidence');assert.equal(commandEvidence.sourceCommit,final.candidateCommit);
  const events=commandEvidence.events;assert.ok(Array.isArray(events));assert.deepEqual(events.map(e=>e.sequence),events.map((_,i)=>i+1));
  const matches=(args,exit)=>events.filter(e=>args.every(a=>e.args.includes(a))&&(exit==='nonzero'?e.exitCode!==0:e.exitCode===exit));
  assert.ok(matches(['image','ls','-q'],0).filter(e=>!(e.output??[]).join('').trim()).length>=2,'Empty isolated image store must be observed twice');
  assert.ok(matches(['pull'], 'nonzero').length>0,'Registry block must be demonstrated');
  assert.ok(matches(['wget'],'nonzero').length>0,'IP block must be demonstrated');
  assert.ok(events.some(e=>e.exitCode!==0&&e.args.some(a=>a.includes('/dev/tcp/1.1.1.1/80'))),'Product-container egress block must be demonstrated');
  assert.ok(matches(['load','-i','wiremock.tar'],0).length>0,'Pinned archive import required');
  assert.ok(events.some(e=>e.exitCode===0&&(e.output??[]).some(line=>line===lifecycle.imageId+' linux/amd64')),'Imported image ID/architecture mismatch');
  assert.ok(matches(['rm','-fv','mockup-v2-offline-daemon'],0).length>0);assert.ok(matches(['network','rm','mockup-v2-offline-control'],0).length>0);
  for(const phase of['default-1','default-2','context-1','context-2']){assert.ok(events.some(e=>e.phase===phase&&e.exitCode===0&&e.args.includes('scripts/acceptance/run.mjs')));assert.ok(events.some(e=>e.phase===phase&&e.exitCode===0&&e.args.includes('scripts/offline/state.mjs')&&e.args.includes('started')));}
  assert.equal(lifecycle.sourceCommit,final.candidateCommit);assert.equal(lifecycle.fixtureVersion,final.fixtureVersion);assert.equal(lifecycle.status,'PASS');assert.ok(lifecycle.imageDigest.includes(final.imageDigest));assert.equal(lifecycle.isolatedImageStoreInitiallyEmpty,true);assert.equal(lifecycle.externalDownloadsBlocked,true);assert.equal(lifecycle.ownedResourcesRemoved,true);assert.deepEqual(lifecycle.modes,['default','context']);assert.deepEqual(lifecycle.cycles,[1,2]);
  for(const mode of lifecycle.modes){
   const cycle1=reports.find(r=>r.mode===mode&&r.cycle===1),cycle2=reports.find(r=>r.mode===mode&&r.cycle===2);assert.ok(cycle1&&cycle2);assert.deepEqual(cycle1.snapshots,cycle2.snapshots);assert.deepEqual(Object.keys(cycle1.snapshots).sort(),['confluence','jira']);
   for(const r of[cycle1,cycle2]){assert.equal(r.cleanupFailure,undefined);assert.ok(!r.cases.some(c=>c.status==='FAIL'));}
  }
  mark('O-OFFLINE-LIFECYCLE','PASS','Separate empty-store/egress-block/import/2 modes/2 cycles/owned cleanup evidence verified; no host-wide air-gap claim.');
  mark('O-REPEATABILITY','PASS','Same candidate and fixture snapshots match across first and restarted cycles in each mode; earlier failed attempts are retained.');
  final.networkIsolationEvidence={commandsSha256:lifecycle.commandsSha256,lifecycle:'lifecycle.json',hostWideAirGap:false};
 }
 if(audit){assert.equal(audit.candidateCommit,final.candidateCommit);assert.equal(audit.status,'PASS');assert.equal(audit.runtimeMatches,true);assert.deepEqual(Object.keys(audit.scopes).sort(),['bundle','evidence','source']);for(const scope of Object.values(audit.scopes))assert.equal(scope.status,'PASS');mark('O-PRIVACY','PASS','Current source, curated bundle and sanitized evidence audited with private denylist; upstream licenses preserved. Original history excluded from current artifact scope.');final.privacyEvidence=audit;}
 const mock=final.cases.filter(c=>c.target==='mock_http'&&c.required);
 const gate=(gateId,status,reason)=>({gateId,status,reason});
 final.gates=[gate('G-CONTRACT',mock.every(c=>c.status==='PASS')?'PASS':mock.some(c=>c.status==='FAIL')?'FAIL':'BLOCKED','Every required mock_http row includes its assertions; real rendering clause in nullable row is not replaced by standalone formatting.'),gate('G-CONSUMER','NOT_RUN','Real Jira query/parser/Host/CLI/dashboard source is unavailable; standalone consumer is not a substitute.'),gate('G-PRIVACY',find('O-PRIVACY').status,'Current artifact audit scope and limits are explicitly recorded.'),gate('G-OFFLINE',find('O-OFFLINE-LIFECYCLE').status,'Separate isolated environment evidence required.'),gate('G-EVIDENCE','BLOCKED','Mandatory real-consumer evidence is unavailable; no full-completion claim.')];
 final.completion={declared:false,reason:'Server-side delivery evidence only: mandatory real-consumer/rendering evidence remains unavailable.'};
 final.summary=Object.fromEntries(['PASS','FAIL','BLOCKED','NOT_RUN','SKIPPED'].map(status=>[status,final.cases.filter(c=>c.status===status).length]));
 assert.equal(final.cases.length,91);return final;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),option=(key)=>{const i=args.indexOf(key);return i<0?undefined:args[i+1];};
 const dir=option('--reports'),output=option('--output');assert.ok(dir&&output);assert.equal(existsSync(output),false);
 const spec=JSON.parse(readFileSync(new URL('../../docs/acceptance/mockup-server-acceptance.json',import.meta.url),'utf8'));
 const reports=readdirSync(dir).filter(p=>/^acceptance-(default|context)-[12]\.json$/.test(p)).sort().map(p=>JSON.parse(readFileSync(join(dir,p),'utf8')));
 const lifecycleFile=option('--lifecycle'),auditFile=option('--audit');const lifecycle=lifecycleFile?JSON.parse(readFileSync(lifecycleFile,'utf8')):undefined;
 if(lifecycle){const log=readFileSync(join(dir,'commands.log'));assert.equal(createHash('sha256').update(log).digest('hex'),lifecycle.commandsSha256,'Lifecycle log changed');}
 let commandEvidence;
 if(lifecycle){const bytes=readFileSync(join(dir,'commands.json'));assert.equal(createHash('sha256').update(bytes).digest('hex'),lifecycle.commandEvidenceSha256);commandEvidence=JSON.parse(bytes);}
 const result=combineReports(spec,reports,{lifecycle,commandEvidence,audit:auditFile?JSON.parse(readFileSync(auditFile,'utf8')):undefined});
 writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({rows:result.cases.length,summary:result.summary,completionDeclared:false}));
 const unexpected=result.cases.filter(c=>c.status!=='PASS'&&c.expandedCaseId!=='J-NULLABLE-FIELDS'&&!c.expandedCaseId.startsWith('I-REAL-CONSUMER-'));
 process.exitCode=unexpected.length?1:args.includes('--server-only')?0:2;
}
