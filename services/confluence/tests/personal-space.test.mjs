import assert from 'node:assert/strict';
import test from 'node:test';
const base=process.env.CONFLUENCE_BASE_URL??'http://127.0.0.1:8082';
const origin=new URL(base).origin;
const context=new URL(base).pathname.replace(/\/$/,'');
const valid='Bearer mock-confluence-token';
const error=(statusCode,message,reason)=>({statusCode,message,reason});
async function get(path,auth=valid,method='GET') {
 const url=path.startsWith('http')?path:path.startsWith(context+'/rest/')&&context?origin+path:base+path;
 const r=await fetch(url,{method,headers:auth===null?{}:{Authorization:auth},signal:AbortSignal.timeout(10000)});
 assert.match(r.headers.get('content-type'),/application\/json/);
 if(method==='HEAD')assert.ok(r.headers.get('connection').split(',').every(v=>v.trim()==='close'));else assert.equal(r.headers.get('connection'),'close');
 return {status:r.status,body:method==='HEAD'?null:await r.json()};
}
async function select(state){if(state==='Started'){const reset=await fetch(origin+'/__admin/scenarios/reset',{method:'POST'});assert.equal(reset.ok,true);return;}const r=await fetch(origin+'/__admin/scenarios/product-read/state',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({state})});assert.equal(r.ok,true);}
const keys=['MOCK','EMPTY','~mock-user-a'];
const ids={MOCK:['20001','20002','20003'],EMPTY:[],'~mock-user-a':['22001','22002','22003']};

test('V2-C: general/personal space detail, limit=1 traversal, storage and context links',async t=>{
 await select('Started');t.after(()=>select('Started'));
 const spaces=(await get('/rest/api/space')).body;
 assert.deepEqual(spaces.results.map(s=>s.key),keys);
 for(const key of keys){
  const path='/rest/api/space/'+key;
  const detail=await get(path);assert.equal(detail.status,200);assert.deepEqual(detail.body,spaces.results.find(s=>s.key===key));
  assert.equal(detail.body._links.base,origin);assert.equal(detail.body._links.context,context);assert.equal(detail.body._links.self,base+path);
  assert.deepEqual(await get(detail.body._links.self),detail);
  const visited=[];let next=path+'/content/page?limit=1';let steps=0;
  while(next){
   assert.ok(++steps<=3,'next must terminate');const page=await get(next);assert.equal(page.status,200);
   assert.equal(page.body.limit,1);assert.equal(page.body.start,visited.length);assert.equal(page.body.size,page.body.results.length);
   assert.equal(page.body._links.base,origin);assert.equal(page.body._links.context,context);assert.deepEqual(await get(page.body._links.self),page);
   for(const item of page.body.results){
    const content=await get(item._links.self);assert.equal(content.status,200);assert.deepEqual(content.body.space,detail.body);
    const expanded=await get(item._links.self+'?expand=body%2Estorage');assert.equal(expanded.status,200);
    const {body,...metadata}=expanded.body;assert.deepEqual(metadata,content.body);assert.equal(body.storage.representation,'storage');
    assert.ok(body.storage.value.includes(item.id)||item.id==='20001');assert.equal(content.body.body,undefined);
    visited.push(item.id);
   }
   if(page.body.start>0){const previous=await get(page.body._links.prev);assert.equal(previous.body.start,page.body.start-1);}
   next=page.body._links.next;
  }
  assert.deepEqual(visited,ids[key]);assert.equal(new Set(visited).size,visited.length);
  for(const start of[0,1,2,3,4]){
   const page=await get(path+`/content/page?limit=%31&start=%3${start}`);assert.equal(page.status,200);
   assert.deepEqual(page.body.results.map(p=>p.id),ids[key].slice(start,start+1));assert.equal(page.body.start,start);assert.equal(page.body.size,page.body.results.length);
   if(!page.body.size){assert.equal(page.body._links.next,undefined);assert.equal(page.body._links.prev,undefined);}
  }
 }
 for(const suffix of['','/content/page','/content/page?limit=1','/content/page?start=2&limit=2']){
  const encoded=await get('/rest/api/space/%7Emock-user-a'+suffix);assert.equal(encoded.status,200);
  const plain=await get('/rest/api/space/~mock-user-a'+suffix);
  assert.deepEqual(encoded.body.results??encoded.body,plain.body.results??plain.body);
 }
});

test('V2-C: supported shape authentication and all error states, unknown data and delay',async t=>{
 await select('Started');t.after(()=>select('Started'));
 const paths=[];
 for(const key of[...keys,'~mock-absent','ABSENT']){
  paths.push('/rest/api/space/'+key);
  for(const suffix of['?limit=1',...[0,1,2,3,4].map(s=>`?start=${s}&limit=1`)])paths.push(`/rest/api/space/${key}/content/page${suffix}`);
  if(key.startsWith('~'))for(const suffix of['','?start=0&limit=2','?start=2&limit=2','?start=4&limit=2'])paths.push(`/rest/api/space/${key}/content/page${suffix}`);
 }
 for(const id of ids['~mock-user-a'])for(const suffix of['','?expand=body.storage'])paths.push('/rest/api/content/'+id+suffix);
 const baseline=[];
 for(const path of paths){const r=await get(path);assert.equal(r.status,/ABSENT|absent/.test(path)?404:200,path);if(r.status===404)assert.deepEqual(r.body,error(404,'No content found','Not Found'));baseline.push(r);}
 for(const[state,status,message,reason]of[['Started'],['forbidden',403,'Forbidden','Forbidden'],['not-found',404,'No content found','Not Found'],['server-error',500,'Internal server error','Internal Server Error']]){
  await select(state);
  for(const path of paths){
   if(state!=='Started')assert.deepEqual(await get(path),{status,body:error(status,message,reason)},path);
   for(const auth of[null,'Bearer wrong','Bearer mock-jira-token','Basic abc'])assert.deepEqual(await get(path,auth),{status:401,body:error(401,'Authentication required','Unauthorized')},path);
  }
 }
 await select('delay');
 for(let i=0;i<paths.length;i++){const began=performance.now();const actual=await get(paths[i]);const elapsed=performance.now()-began;assert.deepEqual(actual,baseline[i],paths[i]);console.log('V2-C delay '+paths[i]+': '+elapsed.toFixed(3)+'ms');assert.ok(elapsed>=1500,paths[i]+': '+elapsed+'ms');}
 // Client timeout/cancellation behavior is exercised separately by the shared delay suite.
 await select('Started');for(let i=0;i<paths.length;i++)assert.deepEqual(await get(paths[i]),baseline[i]);
});

test('V2-C: unsupported requests stay explicit fallback in every scenario',async t=>{
 await select('Started');t.after(()=>select('Started'));
 const page='/rest/api/space/~mock-user-a/content/page';
 const paths=['?start=0','?limit=2','?start=5&limit=1','?start=-1&limit=1','?start=00&limit=1','?start=1.0&limit=1','?limit=0','?limit=1&limit=1','?limit=1&start=1&start=1','?limit=1&extra=1','?limit=1&','?Limit=1','?expand=body.storage'].map(q=>page+q);
 paths.push('/rest/api/space/~mock-user-a?expand=description','/rest/api/space/~mock-user-a/','/rest/api/space/~Mock-user-a',page+'/',page.replace('/page','/blogpost'));
 for(const state of['Started','forbidden','not-found','server-error','delay']){
  await select(state);
  for(const path of paths)for(const auth of[valid,null])assert.deepEqual(await get(path,auth),{status:404,body:{mockError:'UNSUPPORTED_REQUEST',message:'This request is outside the supported mock contract.'}},path);
  for(const method of['POST','PUT','PATCH','DELETE','HEAD']){const r=await get(page+'?limit=1',valid,method);assert.equal(r.status,404);}
 }
});
