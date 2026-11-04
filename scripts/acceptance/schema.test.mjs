import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,cpSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {compileSchemas,expandCases,substitute} from './schema.mjs';
import {consumer,authenticatedConfluenceUser,issueView} from './consumer.mjs';
const spec=JSON.parse(readFileSync(new URL('../../docs/acceptance/mockup-server-acceptance.json',import.meta.url),'utf8'));
const validate=compileSchemas(spec);
test('acceptance schema enforces refs, false properties, nested anyOf and scalar constraints',()=>{
 const issue={id:'10001',key:'MOCK-1',self:'http://127.0.0.1:18581/rest/api/2/issue/10001',fields:{summary:'Synthetic',updated:'2026-01-01',status:{name:'Open',statusCategory:{key:'new'}},priority:null,assignee:null}};
 validate('jiraIssue',issue);
 for(const mutate of[v=>v.key='bad',v=>v.fields.status.statusCategory.key='unknown',v=>v.fields.priority={},v=>v.fields.assignee={name:'mock'},v=>delete v.fields.updated]){const value=structuredClone(issue);mutate(value);assert.throws(()=>validate('jiraIssue',value));}
 validate('confluenceAnonymousUser',{type:'anonymous'});assert.throws(()=>validate('confluenceAnonymousUser',{type:'anonymous',username:'mock'}));
 validate('jiraSearch',{startAt:0,maxResults:1,total:0,issues:[]});for(const value of[-1,0,1.5,'2'])assert.throws(()=>validate('jiraSearch',{startAt:0,maxResults:value,total:0,issues:[]}));
 assert.throws(()=>validate('jiraAuthError',{'status-code':403,message:'Synthetic'}));
 const unknown=structuredClone(spec);unknown.schemas.jiraUser.unknownKeyword=true;assert.throws(()=>compileSchemas(unknown));
});
test('acceptance expansion retains all 91 unique required rows without evaluating text',()=>{
 const rows=expandCases(spec);assert.equal(rows.length,91);assert.equal(rows.filter(r=>r.required).length,91);
 assert.equal(rows.filter(r=>r.id.startsWith('J-PAGINATION-')).length,18);
 assert.equal(rows.filter(r=>r.id.startsWith('M-CONTEXT-')).length,4);
 assert.throws(()=>substitute('{{MISSING}}',{}));assert.equal(substitute('{{TEXT}}',{TEXT:'$(not-code)'}),'$(not-code)');
});
test('standalone consumer rejects redirects, malformed JSON, timeouts and outside links',async t=>{
 let sinkRequests=0;
 const server=createServer((req,res)=>{
  if(req.url==='/redirect'){res.writeHead(302,{Location:'/sink'});res.end();}
  else if(req.url==='/sink'){sinkRequests++;res.end('{}');}
  else if(req.url==='/malformed')res.end('{');
  else if(req.url==='/slow'){const timer=setTimeout(()=>res.end('{}'),250);res.on('close',()=>clearTimeout(timer));}
  else res.end('{}');
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
 const c=consumer('http://127.0.0.1:'+server.address().port,'mock-jira-token');
 await assert.rejects(c.read('/redirect'),{code:'REDIRECT_REFUSED'});assert.equal(sinkRequests,0);
 await assert.rejects(c.read('/malformed'),{code:'INVALID_JSON'});await assert.rejects(c.read('/slow',{timeoutMs:20}),{code:'TIMEOUT'});
 await assert.rejects(c.read('https://jira.example.invalid/rest/api/2/myself'));
 assert.throws(()=>consumer('http://jira.example.invalid','mock-jira-token'));
 assert.throws(()=>consumer(c.base,'real-looking-token'));
});
test('standalone views distinguish anonymous identity and nullable priority',()=>{
 assert.equal(authenticatedConfluenceUser({type:'anonymous'}),false);assert.equal(authenticatedConfluenceUser({type:'known'}),false);
 assert.equal(authenticatedConfluenceUser({type:'known',username:'mock.user-a',userKey:'mock-key'}),true);
 const view=issueView({key:'MOCK-7',fields:{summary:'Synthetic',status:{name:'Open',statusCategory:{key:'new'}},updated:'2026-01-02T09:00:00.000+0000',priority:null}});
 assert.equal(view.priority,'No priority');assert.ok(Number.isFinite(view.updated));
});


test('actual Jira generator filters resolution even when every status/category contradicts it',t=>{
 const sandbox=mkdtempSync(join(tmpdir(),'mockup-resolution-proof-'));
 t.after(()=>{assert.ok(realpathSync(sandbox).startsWith(realpathSync(tmpdir())+sep));rmSync(sandbox,{recursive:true,force:true});});
 mkdirSync(join(sandbox,'services'),{recursive:true});cpSync(new URL('../../services/jira',import.meta.url),join(sandbox,'services/jira'),{recursive:true});
 mkdirSync(join(sandbox,'docs/acceptance'),{recursive:true});const changed=structuredClone(spec);
 for(const issue of changed.fixtureModel.jira.issues){issue.status=issue.resolution===null?'Done':'Open';issue.category=issue.resolution===null?'done':'new';}
 writeFileSync(join(sandbox,'docs/acceptance/mockup-server-acceptance.json'),JSON.stringify(changed));
 execFileSync(process.execPath,[join(sandbox,'services/jira/tools/generate-v2.mjs')],{stdio:'pipe'});
 for(const[scope,role]of[['assigned','assignee'],['reported','reporter']])for(const resolution of['unresolved','resolved']){
  const page=JSON.parse(readFileSync(join(sandbox,`services/jira/__files/search-v2/${role}-${resolution}/all/2/0.json`),'utf8'));
  assert.deepEqual(page.issues.map(i=>i.key),spec.fixtureModel.jira.expectedIssueSets[scope][resolution]);assert.equal(page.total,2);
  for(const issue of page.issues){assert.equal(issue.fields.resolution===null,resolution==='unresolved');assert.equal(issue.fields.status.statusCategory.key,resolution==='unresolved'?'done':'new');}
 }
});
