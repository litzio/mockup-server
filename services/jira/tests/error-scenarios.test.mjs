import assert from 'node:assert/strict';
import test from 'node:test';

const products = ['jira', 'confluence'];
const bases = products.map((p, i) => process.env[p.toUpperCase() + '_BASE_URL'] ?? `http://127.0.0.1:${8081+i}`);
const fallback = {mockError:'UNSUPPORTED_REQUEST',message:'This request is outside the supported mock contract.'};
const paths = [
 ['/rest/api/2/myself','/rest/api/2/project', ...['MOCK-1','MOCK-2','MOCK-3','ABSENT-9','10001','10002','10003','99999'].map(k=>'/rest/api/2/issue/'+k), ...['MOCK','EMPTY'].flatMap(p=>['', '&startAt=0&maxResults=2','&startAt=2&maxResults=2','&startAt=4&maxResults=2'].map(q=>'/rest/api/2/search?jql='+encodeURIComponent(`project = ${p} ORDER BY key ASC`)+q))],
 ['/rest/api/user/current','/rest/api/space', ...['20001','20002','20003','99999'].flatMap(id=>['','?expand=body.storage'].map(q=>'/rest/api/content/'+id+q)), ...['MOCK','EMPTY','ABSENT'].flatMap(s=>['','?start=0&limit=2','?start=2&limit=2','?start=4&limit=2'].map(q=>`/rest/api/space/${s}/content/page`+q))]
];
async function admin(i, path, method='GET', body) {
 const r=await fetch(new URL('/__admin/'+path,bases[i]),{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 assert.equal(r.ok,true,`admin ${method} ${path}: ${r.status}`); return r;
}
async function reset(i) {await admin(i,'scenarios/reset','POST');}
async function state(i) {return (await (await admin(i,'scenarios')).json()).scenarios.find(s=>s.name==='product-read').state;}
async function select(i,s) {await admin(i,'scenarios/product-read/state','PUT',{state:s});assert.equal(await state(i),s);}
async function get(i,path,auth=`Bearer mock-${products[i]}-token`,method='GET') {
 const start=performance.now(); const hrStart=process.hrtime.bigint(); const r=await fetch(bases[i]+path,{method,headers:auth===null?{}:{Authorization:auth},signal:AbortSignal.timeout(10000)});
 const headerMs=performance.now()-start;
 assert.match(r.headers.get('content-type'),/application\/json/);assert.equal(r.headers.get('connection'),'close');
 const body=method==='HEAD'?null:await r.json(); return {status:r.status,body,ms:performance.now()-start,headerMs,hrMs:Number(process.hrtime.bigint()-hrStart)/1e6,stubId:r.headers.get('matched-stub-id')};
}
function error(i,status,message,reason) {return i===0?{errorMessages:[message],errors:{}}:{statusCode:status,message,reason};}

test('E: all supported reads, PAT precedence, isolation and repeatable reset', async t=>{
 // File execution is serialized by the service runner: scenarios are server-wide state.
 for(const i of [0,1]) await reset(i);
 t.after(async()=>{for(const i of [0,1]) {await reset(i);assert.equal(await state(i),'Started');assert.equal((await get(i,paths[i][0])).status,200);}});
 for(const i of [0,1]) {
  assert.equal(await state(i),'Started');
  const baseline=[]; for(const path of paths[i]) baseline.push(await get(i,path));
  for(const [s,status,message,reason] of [['forbidden',403,'Forbidden','Forbidden'],['not-found',404,i===0?'Not found':'No content found','Not Found'],['server-error',500,'Internal server error','Internal Server Error'],['delay']]) {
   await select(i,s);
   assert.equal(await state(1-i),'Started');assert.equal((await get(1-i,paths[1-i][0])).status,200);
   for(let n=0;n<paths[i].length;n++) {
    const path=paths[i][n]; const r=await get(i,path);
    assert.equal(r.status,s==='delay'?baseline[n].status:status,path);
    assert.deepEqual(r.body,s==='delay'?baseline[n].body:error(i,status,message,reason),path);
    if(s==='delay') {console.log('E delay '+JSON.stringify({product:products[i],path,...r,body:undefined}));assert.ok(r.ms>=1500,`${path}: ${r.ms}ms`);}
    for(const auth of [null,'Bearer wrong','Basic abc',`Bearer mock-${products[1-i]}-token`,`Bearer MOCK-${products[i].toUpperCase()}-TOKEN`]) {
     const denied=await get(i,path,auth);assert.equal(denied.status,401);assert.deepEqual(denied.body,error(i,401,'Authentication required','Unauthorized'));if(s==='delay') assert.ok(denied.ms<1500,`PAT must not be delayed: ${denied.ms}ms`);
    }
   }
   for(const [path,method] of [[paths[i][0]+'?bad=1','GET'],[paths[i][0],'POST'],[paths[i][0]+'/','GET'],['/rest/unsupported','GET']]) for(const auth of [null,`Bearer mock-${products[i]}-token`]) {
    const r=await get(i,path,auth,method);assert.equal(r.status,404);assert.deepEqual(r.body,fallback);if(s==='delay') assert.ok(r.ms<1500,`fallback must not be delayed: ${r.ms}ms`);
   }
   // Resetting the other product must preserve this product's selected state.
   await reset(1-i);assert.equal(await state(i),s);
   assert.equal((await get(i,paths[i][0])).status,s==='delay'?200:status);
  }
  for(let repeat=0;repeat<2;repeat++) {await reset(i);assert.equal(await state(i),'Started');for(let n=0;n<paths[i].length;n++){const r=await get(i,paths[i][n]);assert.equal(r.status,baseline[n].status);assert.deepEqual(r.body,baseline[n].body);}}
 }
});

// Separate from E's full error matrix: fixed-count observations are never retried
// to obtain a pass. A failed sample remains a failure after all samples are logged.
test('E: delay boundary samples and client timeout are distinct', async t=>{
 for(const i of [0,1]) await reset(i);
 t.after(async()=>{for(const i of [0,1]) {await reset(i);assert.equal(await state(i),'Started');assert.equal((await get(i,paths[i][0])).status,200);}});
 const failures=[];
 for(const i of [0,1]) {
  const path=paths[i][0];
  const baseline=await get(i,path);
  await select(i,'delay');
  for(let sample=0;sample<3;sample++) {
   assert.equal(await state(i),'delay');
   const r=await get(i,path);
   const mapping=await (await admin(i,'mappings/'+r.stubId)).json();
   console.log('E boundary '+JSON.stringify({product:products[i],sample,configuredMs:mapping.response.fixedDelayMilliseconds,...r,body:undefined}));
   assert.equal(mapping.requiredScenarioState,'delay');
   assert.equal(mapping.response.fixedDelayMilliseconds,1500);
   assert.equal(r.status,baseline.status);assert.deepEqual(r.body,baseline.body);
   if(r.ms<1500) failures.push(`${products[i]} sample ${sample}: ${r.ms}ms`);
  }
  // This is a synthetic Fetch consumer, not the unavailable product client.
  const start=performance.now();
  await assert.rejects(async()=>{
   const response=await fetch(bases[i]+path,{headers:{Authorization:`Bearer mock-${products[i]}-token`},signal:AbortSignal.timeout(500)});
   await response.json();
  },{name:'TimeoutError'});
  const elapsedMs=performance.now()-start;
  console.log('E timeout '+JSON.stringify({product:products[i],timeoutMs:500,elapsedMs}));
  assert.ok(elapsedMs<1500,`timeout must precede delayed response: ${elapsedMs}ms`);
  assert.equal(await state(i),'delay');
  assert.equal(await state(1-i),'Started');
  // Cancellation must not poison subsequent requests or reset server state.
  const after=await get(i,path);
  console.log('E after cancellation '+JSON.stringify({product:products[i],...after,body:undefined}));
  assert.deepEqual(after.body,baseline.body);assert.equal(after.status,baseline.status);
  if(after.ms<1500) failures.push(`${products[i]} after cancellation: ${after.ms}ms`);
  await reset(i);assert.equal(await state(i),'Started');
  assert.deepEqual((await get(i,path)).body,baseline.body);
 }
 assert.deepEqual(failures,[],'all observations must meet the unchanged 1500ms minimum');
});
