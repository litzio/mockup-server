import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base=process.env.JIRA_BASE_URL??'http://127.0.0.1:8081';
const auth='Bearer mock-jira-token';
const fields='summary,status,priority,updated';
// Independent acceptance oracle, deliberately not imported from the generator.
const expected={
  assignee:{unresolved:[1,8],resolved:[2,6],all:[1,2,6,8]},
  reporter:{unresolved:[3,7],resolved:[2,4],all:[2,3,4,7]},
};
const jql=(role,res)=>`${role} = currentUser()${res==='all'?'':res==='resolved'?' AND resolution IS NOT EMPTY':' AND resolution = Unresolved'} ORDER BY updated DESC`;
const path=(role,res,extra={})=>'/rest/api/2/search?'+new URLSearchParams({jql:jql(role,res),...extra});
async function get(path,token=auth,method='GET') {
  const r=await fetch(base+path,{method,headers:token===null?{}:{Authorization:token},signal:AbortSignal.timeout(10000)});
  assert.match(r.headers.get('content-type'),/application\/json/);
  return {status:r.status,body:await r.json()};
}
async function state(value) {
  const r=value==='Started'?await fetch(new URL('/__admin/scenarios/reset',base),{method:'POST'}):await fetch(new URL('/__admin/scenarios/product-read/state',base),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:value})});
  assert.equal(r.status,200);
}
const perms=a=>a.length===0?[[]]:a.flatMap((x,i)=>perms(a.filter((_,j)=>i!==j)).map(rest=>[x,...rest]));

test('V2-J: checked-in generated WireMock resources match their source',()=>{
  execFileSync(process.execPath,[fileURLToPath(new URL('../tools/generate-v2.mjs',import.meta.url)),'--check'],{stdio:'pipe'});
});

test('V2-J: six current-user searches, projection and real pagination consumer',async()=>{
  await state('Started');
  const me=(await get('/rest/api/2/myself')).body;
  for(const role of ['assignee','reporter']) for(const res of ['unresolved','resolved','all']) for(const requested of [1,2,100]) {
    const keys=expected[role][res].map(n=>'MOCK-'+n), collected=[];
    let offset=0, pages=0, prior=Infinity;
    do {
      const r=await get(path(role,res,{fields,startAt:String(offset),maxResults:String(requested)}));
      assert.equal(r.status,200); const p=r.body;
      assert.equal(p.total,keys.length); assert.equal(p.startAt,offset); assert.equal(p.maxResults,Math.min(2,requested));
      assert.ok(p.issues.length>0);assert.ok(p.issues.length<=p.maxResults);
      assert.deepEqual(p.issues.map(i=>i.key),keys.slice(offset,offset+p.maxResults));
      for(const issue of p.issues) {
        assert.deepEqual(Object.keys(issue.fields).sort(),['priority','status','summary','updated']);
        assert.equal(typeof issue.key,'string'); assert.equal(typeof issue.fields.summary,'string');
        assert.ok(['new','indeterminate','done'].includes(issue.fields.status.statusCategory.key));
        assert.equal(typeof issue.fields.status.name,'string');
        const timestamp=Date.parse(issue.fields.updated); assert.ok(Number.isFinite(timestamp)); assert.ok(timestamp<=prior); prior=timestamp;
        assert.ok(issue.fields.priority===null||typeof issue.fields.priority.name==='string');
        const detail=(await get('/rest/api/2/issue/'+issue.key)).body;
        assert.equal(detail.fields[role].key,me.key);
        if(res!=='all') assert.equal(detail.fields.resolution!==null,res==='resolved');
        for(const field of fields.split(',')) assert.deepEqual(issue.fields[field],detail.fields[field]);
        const linked=await get(new URL(issue.self).pathname.replace(new URL(base).pathname==='/'?'':new URL(base).pathname,''));
        assert.deepEqual(linked.body,detail);
      }
      // This is a contract consumer, not the unavailable production client.
      collected.push(...p.issues.map(i=>({key:i.key,title:i.fields.summary,status:i.fields.status.name,category:i.fields.status.statusCategory.key,priority:i.fields.priority?.name??null,updated:new Date(i.fields.updated).toISOString()})));
      offset+=p.issues.length; pages++;assert.ok(pages<=keys.length+2);
    } while(offset<keys.length);
    assert.equal(pages,Math.ceil(keys.length/Math.min(2,requested))); assert.deepEqual(collected.map(i=>i.key),keys); assert.equal(new Set(collected.map(i=>i.key)).size,keys.length);
    for(const start of [keys.length,keys.length+1,999999999]) {
      const empty=(await get(path(role,res,{fields,startAt:String(start),maxResults:'100'}))).body;
      assert.deepEqual(empty,{startAt:start,maxResults:2,total:keys.length,issues:[]});
    }
    const full=(await get(path(role,res))).body;
    assert.equal(full.total,keys.length);assert.equal(full.maxResults,2);
    for(const issue of full.issues) assert.deepEqual(issue,(await get('/rest/api/2/issue/'+issue.key)).body);
    assert.deepEqual((await get(path(role,res))).body,full);
    assert.deepEqual((await get(path(role,res,{maxResults:'1',startAt:'1'}))).body.issues.map(i=>i.key),keys.slice(1,2));
  }
});

test('V2-J: parameter order, equivalent encodings and strict unsupported boundary',async()=>{
  const parts=[`jql=${encodeURIComponent(jql('assignee','all'))}`,`fields=${encodeURIComponent(fields)}`,'startAt=2','maxResults=100'];
  const expectedPage=await get('/rest/api/2/search?'+parts.join('&'));
  for(const order of perms(parts)) assert.deepEqual(await get('/rest/api/2/search?'+order.join('&')),expectedPage);
  assert.deepEqual(await get('/rest/api/2/search?'+parts.join('&').replaceAll('%20','+').replace('jql=','%6Aql=').replace('fields=','%66ields=').replace('startAt=2','%73tartAt=%32').replace('maxResults=100','max%52esults=%31%30%30')),expectedPage);
  const good=path('assignee','all',{fields,startAt:'0',maxResults:'100'});
  for(const bad of [good+'&extra=1',good+'&jql=wrong',good+'&%6Aql='+encodeURIComponent(jql('assignee','all')),good+'&fields='+fields,good+'&startAt=0',good+'&maxResults=100',good.replace('startAt=0','startAt=00'),good.replace('startAt=0','startAt=-1'),good.replace('startAt=0','startAt=1.5'),good.replace('startAt=0','startAt=1000000000'),good.replace('maxResults=100','maxResults=3'),good.replace('maxResults=100','maxResults=0100'),path('assignee','all',{fields:'summary'}),path('assignee','all',{expand:'names'}),good.replace('DESC','ASC'),good.replace('currentUser','otherUser')]) {
    for(const token of [auth,null,'Bearer wrong']) {
      const r=await get(bad,token);assert.equal(r.status,404,bad);assert.equal(r.body.mockError,'UNSUPPORTED_REQUEST',bad);
    }
  }
  for(const method of ['POST','PUT','DELETE','PATCH']) assert.equal((await get(good,auth,method)).body.mockError,'UNSUPPORTED_REQUEST');
});

test('V2-J: auth, error states, empty search and reset preserve normal reads',async t=>{
  t.after(()=>state('Started'));
  for(const selected of ['Started','forbidden','not-found','server-error','delay','empty-search']) {
    await state(selected);
    for(const endpoint of ['/rest/api/2/issue/MOCK-8','/rest/api/2/issue/10008', '/rest/api/2/search?'+new URLSearchParams({jql:'project = MOCK ORDER BY key ASC',startAt:'6',maxResults:'2'})]) {
      const r=await get(endpoint);
      assert.equal(r.status,{forbidden:403,'not-found':404,'server-error':500}[selected]??200);
      if(r.status===200) assert.equal(r.body.key??r.body.issues.at(-1).key,'MOCK-8');
      assert.equal((await get(endpoint,null)).status,401);
    }
    for(const role of ['assignee','reporter']) for(const res of ['unresolved','resolved','all']) {
      const url=path(role,res,{fields,startAt:'0',maxResults:'100'});
      for(const token of [null,'Bearer wrong','Bearer mock-confluence-token','Bearer MOCK-JIRA-TOKEN']) assert.deepEqual(await get(url,token),{status:401,body:{'status-code':401,message:'Authentication required'}});
      const r=await get(url);
      const code={forbidden:403,'not-found':404,'server-error':500}[selected]??200;
      assert.equal(r.status,code);
      if(code!==200) assert.deepEqual(r.body,{errorMessages:[{403:'Forbidden',404:'Not found',500:'Internal server error'}[code]],errors:{}});
      if(selected==='empty-search') assert.deepEqual(r.body,{startAt:0,maxResults:2,total:0,issues:[]});
      if(selected==='Started'||selected==='delay') assert.deepEqual(r.body.issues.map(i=>i.key),expected[role][res].slice(0,2).map(n=>'MOCK-'+n));
    }
    if(selected==='empty-search') {
      for(const endpoint of ['/rest/api/2/myself','/rest/api/2/project','/rest/api/2/issue/MOCK-1','/rest/api/2/issue/MOCK-8']) assert.equal((await get(endpoint)).status,200);
      assert.equal((await get('/rest/api/2/issue/MOCK-999')).status,404);
      assert.equal((await get(path('assignee','all',{startAt:'5'}))).body.total,0);
    }
  }
  await state('Started');assert.equal((await get(path('assignee','all'))).body.total,4);
});

test('J-FIELDS/J-DETAIL/J-NULLABLE/J-INVALID: supplied acceptance projections and errors',async()=>{
  const enriched=fields+',assignee,reporter,resolution,created,resolutiondate';
  for(const selection of [fields,enriched]) {
    const r=await get(path('reporter','unresolved',{fields:selection,maxResults:'100'}));assert.equal(r.status,200);
    assert.deepEqual(r.body.issues.map(i=>i.key),['MOCK-3','MOCK-7']);
    for(const issue of r.body.issues) {
      assert.deepEqual(Object.keys(issue.fields).sort(),selection.split(',').sort());
      for(const id of [issue.key,issue.id]) {
        const detail=await get('/rest/api/2/issue/'+id+'?'+new URLSearchParams({fields:selection}));
        assert.equal(detail.status,200);assert.deepEqual(detail.body,issue);
      }
      if(selection===enriched) {
        assert.ok(Number.isFinite(Date.parse(issue.fields.created)));
        assert.equal(issue.fields.resolutiondate,null);
        if(issue.key==='MOCK-7') {assert.equal(issue.fields.assignee,null);assert.equal(issue.fields.priority,null);assert.equal(issue.fields.resolution,null);assert.equal(issue.fields.reporter.name,'mock-user-a');}
      }
    }
  }
  for(const id of ['MOCK-1','10001']) assert.equal((await get('/rest/api/2/issue/'+id+'?'+new URLSearchParams({fields}))).body.key,'MOCK-1');
  const empty=await get('/rest/api/2/search?'+new URLSearchParams({jql:'project = EMPTY ORDER BY key ASC',startAt:'0',maxResults:'100',fields}));
  assert.deepEqual(empty,{status:200,body:{startAt:0,maxResults:2,total:0,issues:[]}});
  assert.deepEqual(await get('/rest/api/2/search?'+new URLSearchParams({jql:'assignee ='})),{status:400,body:{errorMessages:['Synthetic invalid JQL'],errors:{}}});
  assert.deepEqual(await get('/rest/api/2/issue/MOCK-999999'),{status:404,body:{errorMessages:['Issue Does Not Exist'],errors:{}}});
});
