import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {compileSchemas,expandCases,atPath,assertSubset} from './schema.mjs';
import {consumer,issueView,authenticatedConfluenceUser,ResponseError} from './consumer.mjs';
import {serverFailures} from './outcome.mjs';

const args=process.argv.slice(2);
const option=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
assert.ok(args.includes('--owned'),'Only explicitly review-owned mock services may be tested (--owned)');
const output=option('--output');assert.ok(output,'--output <new JSON report path> is required');assert.equal(existsSync(output),false,'Never overwrite earlier evidence');
const specBytes=readFileSync(new URL('../../docs/acceptance/mockup-server-acceptance.json',import.meta.url));
const spec=JSON.parse(specBytes);
const validate=compileSchemas(spec);
const cases=expandCases(spec);assert.equal(cases.length,91);
const clients=Object.fromEntries(['jira','confluence'].map(product=>[product,consumer(process.env[product.toUpperCase()+'_BASE_URL']??spec.bindings[product.toUpperCase()+'_BASE_URL'],spec.bindings[product.toUpperCase()+'_PAT'])]));
const fixtures=spec.fixtureModel;
const git=(...a)=>{const r=spawnSync('git',a,{encoding:'utf8'});return r.status===0?r.stdout.trim():null;};
const bundle=existsSync('bundle.json')?JSON.parse(readFileSync('bundle.json','utf8')):null;
const candidate=bundle?.sourceCommit??git('rev-parse','HEAD');assert.match(candidate??'',/^[0-9a-f]{40}$/,'Candidate commit required');
const runId=randomUUID();
const report={...structuredClone(spec.reportTemplate),candidateCommit:candidate,fixtureVersion:fixtures.version,specSha256:createHash('sha256').update(specBytes).digest('hex'),imageDigest:bundle?.repoDigests?.[0]??option('--image-digest','NOT_RECORDED'),runtimeVersions:{node:process.version,ajv:JSON.parse(readFileSync(new URL('../../node_modules/ajv/package.json',import.meta.url),'utf8')).version},networkIsolationEvidence:option('--isolation-evidence','NOT_RUN'),runId,baseUrls:Object.fromEntries(Object.entries(clients).map(([product,client])=>[product,client.base])),mode:option('--mode','local'),cycle:Number(option('--cycle','1')),worktreeDirty:bundle?false:Boolean(git('status','--porcelain')),scope:'standalone contract consumer; no real Jira Host/CLI/UI',cases:[],gates:[],snapshots:{}};
const observations=[];
function note(value){observations.push(value);}
function safeError(error){return error instanceof ResponseError?error.code:error?.code==='ERR_ASSERTION'?'ASSERTION_FAILED':error?.name??'ERROR';}
function assertNoSecrets(body){const text=JSON.stringify(body);for(const token of['mock-jira-token','mock-confluence-token','invalid-mock-token'])assert.ok(!text.includes(token),'Token exposed in response');}
function protectedError(body){assertNoSecrets(body);for(const key of['fields','issues','results','body','summary','title','username','name','key'])assert.equal(Object.hasOwn(body,key),false,'Protected field in error');}
async function admin(product,path,method='GET',body){
 const response=await fetch(new URL('/__admin/'+path,clients[product].base),{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(10000)});
 assert.ok(response.ok,'Mock admin status '+response.status);const text=await response.text();return text?JSON.parse(text):null;
}
async function reset(product){await admin(product,'scenarios/reset','POST');}
async function state(product){return(await admin(product,'scenarios')).scenarios.find(s=>s.name==='product-read')?.state;}
async function select(product,value){await admin(product,'scenarios/product-read/state','PUT',{state:value});assert.equal(await state(product),value);}
function identityPath(product){return product==='jira'?'/rest/api/2/myself':'/rest/api/user/current';}
function protectedPath(product){return product==='jira'?'/rest/api/2/issue/MOCK-1':'/rest/api/content/30001';}
function assertLinks(value,client){
 if(!value||typeof value!=='object')return;
 const url=new URL(client.base),context=url.pathname==='/'?'':url.pathname;
 for(const[key,item]of Object.entries(value)){
  if(key==='self'&&typeof item==='string'){assert.equal(new URL(item).origin,url.origin);assert.ok(new URL(item).pathname.startsWith(context+'/rest/'));}
  if(key==='base')assert.equal(item,url.origin);
  if(key==='context')assert.equal(item,context);
  if(['next','prev'].includes(key)&&typeof item==='string'){const link=new URL(item,url.origin);assert.equal(link.origin,url.origin);assert.ok(link.pathname.startsWith(context+'/rest/'));}
  assertLinks(item,client);
 }
}
function expectedCheck(c,result){
 const e=c.expected??{};if(e.status!==undefined)assert.equal(result.status,e.status);
 if(e.schema)validate(e.schema,result.body);
 if(e.bodySubset)assertSubset(result.body,e.bodySubset);
 for(const path of e.requiredPaths??[])assert.notEqual(atPath(result.body,path),undefined,'Missing '+path);
 for(const path of e.absentPaths??[])assert.equal(atPath(result.body,path),undefined,'Unexpected '+path);
 for(const[path,value]of Object.entries(e.bodyPaths??{}))assert.deepEqual(atPath(result.body,path),value);
 assertNoSecrets(result.body);
 for(const id of c.evidence??[]){const source=spec.liveEvidence.observations.find(e=>e.id===id);for(const key of source?.requiredObservedKeys??[])assert.ok(Object.hasOwn(result.body,key),'Missing observed key '+key);}
}
function query(scope,resolution){const owner=scope==='assigned'?'assignee':'reporter';return owner+' = currentUser()'+({unresolved:' AND resolution = Unresolved',resolved:' AND resolution IS NOT EMPTY',all:''}[resolution])+' ORDER BY updated DESC';}
function projection(kind='minimal'){return kind==='enriched'?fixtures.jira.enrichedFieldsProjection:fixtures.jira.fieldsProjection;}
function expectedIssues(scope,resolution){return fixtures.jira.expectedIssueSets[scope][resolution];}
function assertIssue(issue,fields){
 validate('jiraIssue',issue);const seed=fixtures.jira.issues.find(i=>i.key===issue.key);assert.ok(seed,'Unexpected issue');assert.equal(issue.id,seed.id);
 const selected=fields.split(',');assert.deepEqual(Object.keys(issue.fields).sort(),[...selected].sort(),'Unrequested fields or missing projection');
 assert.equal(issue.fields.summary,seed.summary);assert.equal(issue.fields.status.name,seed.status);assert.equal(issue.fields.status.statusCategory.key,seed.category);
 assert.equal(Date.parse(issue.fields.updated),Date.parse(seed.updated));assert.ok(Number.isFinite(Date.parse(issue.fields.updated)));
 assert.deepEqual(issue.fields.priority===null?null:issue.fields.priority.name,seed.priority);issueView(issue);
 if(selected.includes('assignee')){
  assert.equal(issue.fields.assignee===null?null:issue.fields.assignee.name,seed.assignee);assert.equal(issue.fields.reporter.name,seed.reporter);
  for(const key of['assignee','reporter'])if(issue.fields[key])assertSubset(issue.fields[key],fixtures.jira.users.find(u=>u.name===seed[key]));
  assert.equal(issue.fields.resolution===null?null:issue.fields.resolution.name,seed.resolution);assert.ok(Number.isFinite(Date.parse(issue.fields.created)));
  if(seed.resolution===null)assert.equal(issue.fields.resolutiondate,null);else assert.ok(Number.isFinite(Date.parse(issue.fields.resolutiondate)));
 }
 assertLinks(issue,clients.jira);
}
async function jiraWalk(scope,resolution,pageSize=100,fields=projection(),client=clients.jira){
 const expected=expectedIssues(scope,resolution),items=[],offsets=new Set();let startAt=0;
 while(items.length<expected.length){
  assert.ok(offsets.size<expected.length+2);assert.ok(!offsets.has(startAt));offsets.add(startAt);
  const r=await client.raw('/rest/api/2/search',{query:{jql:query(scope,resolution),startAt:String(startAt),maxResults:String(pageSize),fields}});
  assert.equal(r.status,200);validate('jiraSearch',r.body);assert.equal(r.body.startAt,startAt);assert.equal(r.body.total,expected.length);
  assert.ok(r.body.issues.length>0);assert.ok(r.body.issues.length<=r.body.maxResults&&r.body.maxResults<=pageSize);
  for(const issue of r.body.issues)assertIssue(issue,fields);
  items.push(...r.body.issues);startAt+=r.body.issues.length;
 }
 assert.deepEqual(items.map(i=>i.key),expected);assert.equal(new Set(items.map(i=>i.key)).size,items.length);
 for(let i=1;i<items.length;i++)assert.ok(Date.parse(items[i-1].fields.updated)>=Date.parse(items[i].fields.updated));
 for(const offset of[expected.length,expected.length+1]){const r=await client.raw('/rest/api/2/search',{query:{jql:query(scope,resolution),startAt:String(offset),maxResults:String(pageSize),fields}});assert.equal(r.status,200);validate('jiraSearch',r.body);assert.equal(r.body.startAt,offset);assert.equal(r.body.total,expected.length);assert.deepEqual(r.body.issues,[]);}
 note({operation:'jira-pages',scope,resolution,pageSize,pages:offsets.size,keys:items.map(i=>i.key),total:expected.length});return items;
}
async function confluenceWalk(path,pageSize,expected,type,client=clients.confluence){
 const visited=[],seen=new Set();let link=path+'?start=0&limit='+pageSize;let previous;
 while(link){
  assert.ok(seen.size<expected.length+2);assert.ok(!seen.has(link));seen.add(link);
  const body=await client.read(link);validate('confluenceList',body);assertLinks(body,client);
  assert.equal(body.start,visited.length);assert.equal(body.size,body.results.length);assert.ok(body.size<=body.limit&&body.limit<=pageSize);
  assert.ok(body.results.length>0||expected.length===0);
  if(body._links.prev){assert.ok(previous);const prev=await client.read(new URL(body._links.prev,new URL(client.base).origin).href);assert.equal(prev.start,previous.start);assert.deepEqual(prev.results,previous.results);assert.equal(new URL(body._links.prev,new URL(client.base).origin).searchParams.get('limit'),String(pageSize));}
  for(const item of body.results){
   validate(type,item);const detail=await client.read(item._links.self);validate(type,detail);assert.equal(detail.id,item.id);assertLinks(detail,client);
   if(type==='confluencePage')assert.equal(detail.title,item.title);else assert.equal(detail.key,item.key);
   visited.push(item);
  }
  previous=body;link=body._links.next?new URL(body._links.next,new URL(client.base).origin).href:null;
  if(link)assert.equal(new URL(link).searchParams.get('limit'),String(pageSize));
  if(visited.length>=expected.length)assert.equal(link,null);
 }
 assert.deepEqual(visited.map(i=>String(i.id)),expected.map(i=>String(i.id)));assert.equal(new Set(visited.map(i=>i.id)).size,visited.length);
 for(const start of[expected.length,expected.length+1]){const r=await client.raw(path,{query:{start:String(start),limit:String(pageSize)}});assert.equal(r.status,200);validate('confluenceList',r.body);assert.equal(r.body.start,start);assert.deepEqual(r.body.results,[]);assert.equal(r.body._links.next,undefined);}
 note({operation:'confluence-pages',path,pageSize,ids:visited.map(i=>i.id),requests:seen.size});return visited;
}
async function representative(product,client=clients[product]){
 const user=await client.read(identityPath(product));validate(product==='jira'?'jiraUser':'confluenceKnownUser',user);assertLinks(user,client);
 if(product==='jira'){
  const list=await client.read('/rest/api/2/search',{query:{jql:query('assigned','all'),startAt:'0',maxResults:'100',fields:projection()}});validate('jiraSearch',list);assert.equal(list.total,4);assertLinks(list,client);
  for(const item of list.issues){const detail=await client.read(item.self);assert.equal(detail.key,item.key);assertLinks(detail,client);}
  return {user:user.name,total:list.total,keys:list.issues.map(i=>i.key)};
 }
 const spaces=await confluenceWalk('/rest/api/space',1,fixtures.confluence.spaces,'confluenceSpace',client);
 const pages=await confluenceWalk('/rest/api/space/'+encodeURIComponent(spec.bindings.PERSONAL_SPACE_KEY)+'/content/page',1,fixtures.confluence.pages.filter(p=>p.spaceKey===spec.bindings.PERSONAL_SPACE_KEY),'confluencePage',client);
 for(const page of pages){const body=await client.read(page._links.self+'?expand=body.storage');assert.equal(body.body.storage.representation,'storage');assert.equal(body.body.storage.value,fixtures.confluence.pages.find(p=>p.id===page.id).storage);}
 return {user:user.username,spaces:spaces.map(s=>s.key),pages:pages.map(p=>p.id)};
}
async function temporaryFault(product,fault){
 const id=randomUUID(),sinkId=randomUUID(),sourcePath='/__acceptance/'+id,sinkPath='/__acceptance/'+sinkId;
 const context=new URL(clients[product].base).pathname.replace(/\/$/,'');
 const requestPath=context+sourcePath,sinkRequestPath=context+sinkPath;
 let response={status:200,headers:{'Content-Type':'application/json'},jsonBody:{synthetic:true}};
 if(fault==='delay'||fault==='timeout')response.fixedDelayMilliseconds=1500;
 if(fault==='malformed_json')response={status:200,headers:{'Content-Type':'application/json'},body:'{ synthetic malformed'};
 if(fault==='http_redirect')response={status:302,headers:{Location:clients[product].base+sinkPath}};
 const before=await clients[product].read(protectedPath(product));
 try{
  await admin(product,'mappings','POST',{id,priority:-100,request:{method:'GET',url:requestPath},response});
  if(fault==='http_redirect')await admin(product,'mappings','POST',{id:sinkId,priority:-100,request:{method:'GET',url:sinkRequestPath},response:{status:200,jsonBody:{synthetic:true}}});
  const started=performance.now();
  if(fault==='delay'){const result=await clients[product].raw(sourcePath);note({fault,product,configuredMs:1500,elapsedMs:result.ms,headerMs:result.headerMs});assert.deepEqual(result.body,{synthetic:true});assert.ok(result.ms>=1500);}
  else {
   const code={timeout:'TIMEOUT',malformed_json:'INVALID_JSON',http_redirect:'REDIRECT_REFUSED'}[fault];
   await assert.rejects(clients[product].read(sourcePath,{timeoutMs:fault==='timeout'?300:10000}),{name:'ResponseError',code});
   const elapsedMs=performance.now()-started;note({fault,product,code,elapsedMs,...(fault==='timeout'?{configuredMs:1500,timeoutMs:300}:{})});
   if(fault==='timeout')assert.ok(elapsedMs<1500);
   if(fault==='http_redirect'){
    const source=await admin(product,'requests/count','POST',{method:'GET',url:requestPath});assert.equal(source.count,1);
    const sink=await admin(product,'requests/count','POST',{method:'GET',url:sinkRequestPath});assert.equal(sink.count,0);
    note({product,fault,sourceRequests:source.count,redirectDestinationRequests:sink.count,credentialedRedirectRequests:0});
   }
  }
 }finally{
  for(const mappingId of[fault==='http_redirect'?sinkId:null,id].filter(Boolean)){
   // Delete only the unique mappings this case created; no global mapping reset.
   const r=await fetch(new URL('/__admin/mappings/'+mappingId,clients[product].base),{method:'DELETE',signal:AbortSignal.timeout(10000)});assert.ok(r.ok||r.status===404);
  }
  await reset(product);assert.deepEqual(await clients[product].read(protectedPath(product)),before);
 }
}
async function execute(c){
 const {row}=c,id=c.definitionId;
 if(id.startsWith('I-REAL-CONSUMER-'))return {status:'NOT_RUN',limitation:'Real consumer source/runtime unavailable by user confirmation; standalone checks do not satisfy Host/CLI/UI.'};
 if(id==='O-PRIVACY')return {status:'NOT_RUN',limitation:'Artifact audit is supplied by the separate current-bundle/evidence audit, not inferred from HTTP.'};
 if(id==='O-OFFLINE-LIFECYCLE')return {status:'NOT_RUN',limitation:'Requires external isolated-store lifecycle evidence; local HTTP alone does not qualify.'};
 if(id.startsWith('M-CONTEXT-')){
  const actual=new URL(clients[row.product].base).pathname.replace(/\/$/,'');
  if(actual!==row.context)return {status:'NOT_RUN',limitation:'This process serves context '+JSON.stringify(actual)+'; another owned deployment is required for '+JSON.stringify(row.context)};
  for(const host of['127.0.0.1','localhost']){
   const url=new URL(clients[row.product].base);url.hostname=host;
   const client=consumer(url.href,spec.bindings[row.product.toUpperCase()+'_PAT']);
   const snapshot=await representative(row.product,client);note({product:row.product,context:actual,host,snapshot});
   if(actual){const r=await fetch(url.origin+identityPath(row.product),{headers:{Authorization:'Bearer '+spec.bindings[row.product.toUpperCase()+'_PAT']},redirect:'manual',signal:AbortSignal.timeout(10000)});assert.equal(r.status,404);assert.equal((await r.json()).mockError,'UNSUPPORTED_REQUEST');}
  }
  return {};
 }
 if(id==='J-IDENTITY-VALID'){
  const r=await clients.jira.raw(c.request.path);expectedCheck(c,r);assertSubset(r.body,fixtures.jira.users[0]);assertLinks(r.body,clients.jira);
 }else if(id.startsWith('J-IDENTITY-DENIED-')){
  const r=await clients.jira.raw(c.request.path,{auth:row.auth});expectedCheck(c,r);protectedError(r.body);
 }else if(id==='J-PROJECTS'){
  const r=await clients.jira.raw(c.request.path);assert.equal(r.status,200);assert.ok(Array.isArray(r.body));assert.deepEqual(r.body.map(p=>p.key),fixtures.jira.projects.map(p=>p.key));
  for(const project of r.body){validate('jiraProject',project);assertSubset(project,fixtures.jira.projects.find(p=>p.key===project.key));assertLinks(project,clients.jira);}
  const issue=await clients.jira.read('/rest/api/2/issue/MOCK-1');assert.equal(issue.fields.project.id,fixtures.jira.projects[0].id);assert.equal(issue.fields.project.key,'MOCK');
 }else if(id.startsWith('J-SEARCH-')||id.startsWith('J-PAGINATION-')){
  await jiraWalk(row.scope,row.resolution,row.pageSize??100);
 }else if(id.startsWith('J-FIELDS-')){
  const fields=projection(row.projection),items=await jiraWalk('assigned','all',100,fields);
  const detail=await clients.jira.raw('/rest/api/2/issue/'+items[0].key,{query:{fields}});assert.equal(detail.status,200);assertIssue(detail.body,fields);assert.deepEqual(detail.body.fields,items[0].fields);
 }else if(id==='J-NULLABLE-FIELDS'){
  const items=await jiraWalk('reported','unresolved',100,projection('enriched'));const item=items.find(i=>i.key==='MOCK-7');assert.ok(item);
  for(const field of['assignee','priority','resolution'])assert.equal(item.fields[field],null);
  assert.ok(!expectedIssues('assigned','all').includes(item.key));assert.equal(issueView(item).priority,'No priority');
  note({standaloneNullSafeFormatter:'PASS',realConsumerRendering:'NOT_RUN'});
  return {status:'BLOCKED',notRunAssertions:['Client renders missing priority without crashing'],limitation:'Null-safe standalone formatting passed; the unavailable real consumer rendering assertion is not verified.'};
 }else if(id==='J-EMPTY-PROJECT'||id==='J-INVALID-JQL'||id==='J-MISSING-ISSUE'){
  const r=await clients.jira.raw(c.request.path,{query:c.request.query});expectedCheck(c,r);if(r.status!==200){protectedError(r.body);assert.equal(r.body.mockError,undefined);}
 }else if(id.startsWith('J-DETAIL-')){
  const r=await clients.jira.raw(c.request.path,{query:c.request.query});expectedCheck(c,r);assert.equal(r.body.key,'MOCK-1');assertIssue(r.body,projection());
  const linked=await clients.jira.read(r.body.self);assert.equal(linked.id,r.body.id);assert.equal(linked.key,r.body.key);
 }else if(id==='C-IDENTITY-VALID'){
  const r=await clients.confluence.raw(c.request.path);expectedCheck(c,r);assertSubset(r.body,fixtures.confluence.user);assert.ok(authenticatedConfluenceUser(r.body));assertLinks(r.body,clients.confluence);
 }else if(id.startsWith('C-IDENTITY-ANONYMOUS-')){
  const r=await clients.confluence.raw(c.request.path,{auth:row.auth});expectedCheck(c,r);assert.equal(authenticatedConfluenceUser(r.body),false);
 }else if(id.startsWith('C-SPACES-PAGINATION-')){
  await confluenceWalk('/rest/api/space',row.pageSize,fixtures.confluence.spaces,'confluenceSpace');
 }else if(id.startsWith('C-PERSONAL-SPACE-')){
  const key=row.encoding==='literal_tilde'?spec.bindings.PERSONAL_SPACE_KEY:spec.bindings.PERSONAL_SPACE_KEY.replace('~','%7E');
  const r=await clients.confluence.raw('/rest/api/space/'+key);expectedCheck(c,r);assertSubset(r.body,fixtures.confluence.spaces[0]);
 }else if(id.startsWith('C-PAGES-')){
  const expected=fixtures.confluence.pages.filter(p=>p.spaceKey===row.spaceKey);
  const pages=await confluenceWalk('/rest/api/space/'+encodeURIComponent(row.spaceKey)+'/content/page',row.pageSize,expected,'confluencePage');
  for(const page of pages)assert.equal(page.title,expected.find(p=>p.id===page.id).title);
 }else if(['C-PAGE-METADATA','C-PAGE-STORAGE','C-PAGE-COMBINED-EXPANSIONS','C-MISSING-PAGE'].includes(id)){
  const r=await clients.confluence.raw(c.request.path,{query:c.request.query});expectedCheck(c,r);
  if(id==='C-MISSING-PAGE'){protectedError(r.body);assert.equal(r.body.mockError,undefined);}
  else {
   const seed=fixtures.confluence.pages[0];assert.equal(r.body.id,seed.id);assert.equal(r.body.title,seed.title);assertLinks(r.body,clients.confluence);
   if(id==='C-PAGE-STORAGE'){const normal=await clients.confluence.read(c.request.path);for(const key of['id','type','status','title'])assert.equal(r.body[key],normal[key]);}
   else {if(id==='C-PAGE-COMBINED-EXPANSIONS'){assert.equal(r.body.body.storage.value,seed.storage);assert.equal(r.body.body.storage.representation,'storage');}assert.equal(r.body.space.key,seed.spaceKey);assert.equal(r.body.version.number,seed.version);assertSubset(r.body.history.createdBy,fixtures.confluence.user);}
  }
 }else if(id.startsWith('M-QUERY-ENCODING-')){
  const product=row.product,client=clients[product];let plain,encoded;
  if(product==='jira'){
   const jql=query('assigned','all'),fields=projection();
   plain=await client.read('/rest/api/2/search',{query:{jql,startAt:'0',maxResults:'100',fields}});
   const percent='/rest/api/2/search?fields='+encodeURIComponent(fields)+'&maxResults=%31%30%30&startAt=%30&jql='+encodeURIComponent(jql);
   encoded=await client.read(percent);const plus=await client.read(percent.replaceAll('%20','+'));assert.deepEqual(plus,encoded);assert.deepEqual(encoded,plain);
   for(const suffix of['&fields='+encodeURIComponent(fields),'&unknown=1']){const r=await client.raw(percent+suffix);assert.equal(r.status,404);assert.equal(r.body.mockError,'UNSUPPORTED_REQUEST');}
  }else{
   const path='/rest/api/space/'+spec.bindings.PERSONAL_SPACE_KEY+'/content/page';
   plain=await client.read(path+'?start=0&limit=1');encoded=await client.read(path.replace('~','%7E')+'?limit=%31&start=%30');assert.deepEqual(encoded.results,plain.results);assert.equal(encoded.start,plain.start);
   for(const suffix of['&limit=1','&unknown=1']){const r=await client.raw(path+'?start=0&limit=1'+suffix);assert.equal(r.status,404);assert.equal(r.body.mockError,'UNSUPPORTED_REQUEST');}
  }
 }else if(id.startsWith('M-ERROR-')){
  const product=row.product,other=product==='jira'?'confluence':'jira';const selected={403:'forbidden',404:'not-found',500:'server-error'}[row.status];
  const otherBefore=await representative(other);await select(product,selected);
  try{
   const r=await clients[product].raw(protectedPath(product));assert.equal(r.status,row.status);validate(product==='jira'?'jiraResourceError':'confluenceError',r.body);protectedError(r.body);assert.equal(r.body.mockError,undefined);
   for(const auth of['missing','invalid']){
    const denied=await clients[product].raw(protectedPath(product),{auth});assert.equal(denied.status,401);validate(product==='jira'?'jiraAuthError':'confluenceError',denied.body);protectedError(denied.body);
    if(product==='confluence'){const anonymous=await clients.confluence.raw(identityPath(product),{auth});assert.equal(anonymous.status,200);validate('confluenceAnonymousUser',anonymous.body);}
   }
   assert.equal(await state(other),'Started');assert.deepEqual(await representative(other),otherBefore);
  }finally{await reset(product);assert.equal(await state(product),'Started');await clients[product].read(protectedPath(product));}
 }else if(id.startsWith('M-FAULT-'))await temporaryFault(row.product,row.fault);
 else if(id.startsWith('M-UNSUPPORTED-')){
  const product=row.product,client=clients[product],before=await client.read(protectedPath(product));
  const paths=['/rest/unsupported',product==='jira'?'/rest/api/2/search?jql=project%20%3D%20UNKNOWN':'/rest/api/content/30001?expand=body.view'];
  for(const[path,method]of[...paths.map(p=>[p,'GET']),...['POST','PUT','DELETE'].map(m=>[protectedPath(product),m])]){const r=await client.raw(path,{method});assert.equal(r.status,404);assert.equal(r.body.mockError,'UNSUPPORTED_REQUEST');}
  assert.deepEqual(await client.read(protectedPath(product)),before);await representative(product);
 }else if(id==='I-CONFLUENCE-READER'){
  const client=clients.confluence,user=await client.read(identityPath('confluence'));assert.ok(authenticatedConfluenceUser(user));await representative('confluence');
  const page=await client.read('/rest/api/content/30001',{query:{expand:'body.storage,version,space,history'}});assert.equal(page.body.storage.value,fixtures.confluence.pages[0].storage);assert.equal(page.space.key,spec.bindings.PERSONAL_SPACE_KEY);assert.equal(page.version.number,1);
  for(const auth of['missing','invalid'])assert.equal(authenticatedConfluenceUser(await client.read(identityPath('confluence'),{auth})),false);
  note({reader:'scripts/acceptance/consumer.mjs + representative',scope:'named standalone Confluence reader; no production plugin claim'});
 }else if(id==='O-REPEATABILITY'){
  for(const product of['jira','confluence']){
   const first=await representative(product);assert.deepEqual(await representative(product),first);await select(product,'server-error');
   try{assert.equal((await clients[product].raw(protectedPath(product))).status,500);}finally{await reset(product);}
   assert.deepEqual(await representative(product),first);report.snapshots[product]=first;
  }
  note({readResetRepeat:'PASS',restart:'Requires matching cycle 1/2 reports and lifecycle evidence'});
  return {status:'BLOCKED',limitation:'Read/reset repeated successfully; restart assertion requires externally recorded cycle 1/2 lifecycle evidence.'};
 }else throw new Error('No handler for '+id);
 return {};
}
try{
 let preflightFailure;
 try{for(const product of['jira','confluence']){await reset(product);assert.equal(await state(product),'Started');}}catch(error){preflightFailure=safeError(error);}
 for(const c of cases){
  observations.length=0;const started=new Date().toISOString();let result;
  try{result=preflightFailure?{status:'BLOCKED',limitation:'Owned service preflight failed: '+preflightFailure}:await execute(c);}catch(error){result={status:'FAIL',limitation:safeError(error)};note({failure:safeError(error),check:(error.message??'').split('\n')[0]});}
  const status=result.status??'PASS';
  const assertions=(c.expected?.assertions??[]).map(text=>({text,status:result.notRunAssertions?.includes(text)?'NOT_RUN':status==='BLOCKED'&&result.notRunAssertions?'PASS':status,scope:report.scope}));
  const record={expandedCaseId:c.id,definitionId:c.definitionId,required:c.required,target:c.target,basis:c.basis,status,assertions,attempts:[{runId,startedAt:started,status,observations:structuredClone(observations)}],expectedSummary:c.expected,actualSanitizedSummary:status==='PASS'?'Executable checks passed in declared standalone scope':result.limitation,evidenceArtifact:runId+'#'+c.id,limitation:result.limitation??null};
  report.cases.push(record);console.log(c.id+' '+status);
 }
}finally{
 for(const product of['jira','confluence']){try{await reset(product);assert.equal(await state(product),'Started');}catch(error){report.cleanupFailure=safeError(error);}}
 report.gates=spec.completionGates.map(g=>({gateId:g.id,status:'NOT_RUN',reason:g.id==='G-CONSUMER'?'Real Jira Host/CLI/UI unavailable; not replaced by standalone consumer':'Requires final aggregation across modes, lifecycle and artifacts'}));
 report.completion={declared:false,reason:'Real consumer gate unavailable; this report is bounded standalone/mock evidence, not full specification completion'};
 writeFileSync(resolve(output),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
}
const failures=report.cases.filter(c=>c.status==='FAIL').length;
const executableFailures=serverFailures(report,cases.map(c=>c.id));
console.log(JSON.stringify({rows:report.cases.length,failures,executableFailures,completionDeclared:false,report:output}));
process.exitCode=executableFailures.length?1:args.includes('--server-only')?0:2;
