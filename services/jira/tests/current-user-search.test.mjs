import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const base=process.env.JIRA_BASE_URL??'http://127.0.0.1:8081';
const auth='Bearer mock-jira-token';
const fields='summary,status,priority,updated';
// Independent acceptance oracle, deliberately not imported from the generator.
const expected={
  assignee:{unresolved:[17,15,13,11,9,7,5,3,1],resolved:[18,14,10,6,2],all:[18,17,15,14,13,11,10,9,7,6,5,3,2,1]},
  reporter:{unresolved:[15,11,7,3,1],resolved:[18,14,12,10,8,6,4,2],all:[18,15,14,12,11,10,8,7,6,4,3,2,1]},
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
  for(const role of ['assignee','reporter']) for(const res of ['unresolved','resolved','all']) {
    const keys=expected[role][res].map(n=>'MOCK-'+n), collected=[];
    let offset=0, pages=0, prior=Infinity;
    do {
      const r=await get(path(role,res,{fields,startAt:String(offset),maxResults:'100'}));
      assert.equal(r.status,200); const p=r.body;
      assert.equal(p.total,keys.length); assert.equal(p.startAt,offset); assert.equal(p.maxResults,2);
      assert.deepEqual(p.issues.map(i=>i.key),keys.slice(offset,offset+2));
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
      offset+=p.maxResults; pages++;
    } while(offset<keys.length);
    assert.ok(pages>=3); assert.deepEqual(collected.map(i=>i.key),keys); assert.equal(new Set(collected.map(i=>i.key)).size,keys.length);
    for(const start of [offset,18,999999999]) {
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
    for(const endpoint of ['/rest/api/2/issue/MOCK-18','/rest/api/2/issue/10018', '/rest/api/2/search?'+new URLSearchParams({jql:'project = MOCK ORDER BY key ASC',startAt:'16',maxResults:'2'})]) {
      const r=await get(endpoint);
      assert.equal(r.status,{forbidden:403,'not-found':404,'server-error':500}[selected]??200);
      if(r.status===200) assert.equal(r.body.key??r.body.issues.at(-1).key,'MOCK-18');
      assert.equal((await get(endpoint,null)).status,401);
    }
    for(const role of ['assignee','reporter']) for(const res of ['unresolved','resolved','all']) {
      const url=path(role,res,{fields,startAt:'0',maxResults:'100'});
      for(const token of [null,'Bearer wrong','Bearer mock-confluence-token','Bearer MOCK-JIRA-TOKEN']) assert.deepEqual(await get(url,token),{status:401,body:{errorMessages:['Authentication required'],errors:{}}});
      const r=await get(url);
      const code={forbidden:403,'not-found':404,'server-error':500}[selected]??200;
      assert.equal(r.status,code);
      if(code!==200) assert.deepEqual(r.body,{errorMessages:[{403:'Forbidden',404:'Not found',500:'Internal server error'}[code]],errors:{}});
      if(selected==='empty-search') assert.deepEqual(r.body,{startAt:0,maxResults:2,total:0,issues:[]});
      if(selected==='Started'||selected==='delay') assert.deepEqual(r.body.issues.map(i=>i.key),expected[role][res].slice(0,2).map(n=>'MOCK-'+n));
    }
    if(selected==='empty-search') {
      for(const endpoint of ['/rest/api/2/myself','/rest/api/2/project','/rest/api/2/issue/MOCK-1','/rest/api/2/issue/MOCK-18']) assert.equal((await get(endpoint)).status,200);
      assert.equal((await get('/rest/api/2/issue/MOCK-999')).status,404);
      assert.equal((await get(path('assignee','all',{startAt:'5'}))).body.total,0);
    }
  }
  await state('Started');assert.equal((await get(path('assignee','all'))).body.total,14);
});
