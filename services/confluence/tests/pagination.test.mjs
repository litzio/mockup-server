import assert from 'node:assert/strict';
import test from 'node:test';
const base=process.env.CONFLUENCE_BASE_URL??'http://127.0.0.1:8082';
const valid='Bearer mock-confluence-token';
const fallback={mockError:'UNSUPPORTED_REQUEST',message:'This request is outside the supported mock contract.'};
const unauthorized={statusCode:401,message:'Authentication required',reason:'Unauthorized'};
async function get(path,auth=valid,method='GET') {
 const r=await fetch(new URL(path,base),{method,headers:auth===null?{}:{Authorization:auth},signal:AbortSignal.timeout(5000)});
 assert.match(r.headers.get('content-type'),/application\/json/);if(method==='HEAD') assert.ok(r.headers.get('connection').split(',').every(v=>v.trim()==='close')); else assert.equal(r.headers.get('connection'),'close');
 return {status:r.status,body:method==='HEAD'?null:await r.json()};
}
test('B-C/C-L: spaces → all pages → detail → storage; self/next/prev traversal is complete',async()=>{
 const spaces=(await get('/rest/api/space')).body;assert.deepEqual(spaces.results.map(s=>[s.id,s.key]),[[20000,'MOCK'],[21000,'EMPTY']]);
 const user=(await get('/rest/api/user/current')).body;
 for(const space of spaces.results) {
  const path='/rest/api/space/'+space.key+'/content/page';
  const all=await get(path);assert.equal(all.status,200);assert.equal(all.body.start,0);assert.equal(all.body.limit,25);
  const expected=space.key==='MOCK'?['20001','20002','20003']:[];
  assert.deepEqual(all.body.results.map(p=>p.id),expected);assert.equal(all.body.size,expected.length);
  assert.deepEqual(all.body._links,{base,context:'',self:base+path});assert.deepEqual(await get(all.body._links.self),all);
  for(const item of all.body.results) {
   assert.equal(item.body,undefined);assert.deepEqual(item.space,space);
   const detail=await get(item._links.self);assert.equal(detail.status,200);
   for(const k of ['id','type','status','title','space','_links']) assert.deepEqual(item[k],detail.body[k]);
   assert.equal(detail.body.body,undefined);assert.deepEqual(detail.body.history.createdBy,user);assert.deepEqual(detail.body.version.by,user);
   const expanded=await get(item._links.self+'?expand=body%2Estorage');assert.equal(expanded.status,200);
   const {body,...metadata}=expanded.body;assert.deepEqual(metadata,detail.body);assert.equal(body.storage.representation,'storage');
   assert.equal(body.storage.value,item.id==='20001'?'<p>Synthetic integration page body.</p>':`<p>Synthetic integration page ${item.id} body.</p>`);
  }
  const traversed=[];let next=path+'?start=0&limit=2';let first;
  while(next) {
   const page=await get(next);assert.equal(page.status,200);assert.equal(page.body.size,page.body.results.length);assert.equal(page.body.limit,2);
   assert.deepEqual(await get(page.body._links.self),page);
   if(!first) first=page;
   else {assert.equal(page.body.start,2);assert.deepEqual(await get(page.body._links.prev),first);}
   traversed.push(...page.body.results.map(p=>p.id));next=page.body._links.next;
   assert.ok(traversed.length<=expected.length);
  }
  assert.deepEqual(traversed,expected);assert.equal(new Set(traversed).size,expected.length);
  for(const start of [0,2,4]) {
   const page=await get(path+`?limit=%32&start=%${String(start).charCodeAt(0).toString(16)}`);assert.equal(page.status,200);
   assert.equal(page.body.start,start);assert.equal(page.body.limit,2);assert.deepEqual(page.body.results,all.body.results.slice(start,start+2));
   assert.equal(page.body.size,page.body.results.length);
   if(space.key==='EMPTY'||start===4) {assert.equal(page.body._links.next,undefined);assert.equal(page.body._links.prev,undefined);}
  }
 }
});
test('C-L: auth priority and unknown spaces/pages across every supported shape',async()=>{
 const paths=[];
 for(const key of ['MOCK','EMPTY','UNKNOWN']) for(const query of ['', '?start=0&limit=2','?limit=2&start=2','?start=4&limit=2']) paths.push(`/rest/api/space/${key}/content/page${query}`);
 for(const id of ['20001','20002','20003','99999']) for(const query of ['', '?expand=body.storage','?expand=body%2Estorage']) paths.push(`/rest/api/content/${id}${query}`);
 for(const path of paths) {
  const ok=await get(path);assert.equal(ok.status,path.includes('UNKNOWN')||path.includes('99999')?404:200);
  if(ok.status===404) assert.deepEqual(ok.body,{statusCode:404,message:'No content found',reason:'Not Found'});
  for(const auth of [null,'Bearer wrong','Bearer MOCK-CONFLUENCE-TOKEN','Bearer mock-jira-token','bearer mock-confluence-token','Basic abc']) assert.deepEqual(await get(path,auth),{status:401,body:unauthorized});
 }
});
test('C-L: unsupported query/path/method boundaries remain fallback for every auth state',async()=>{
 const path='/rest/api/space/MOCK/content/page';
 const paths=['?start=0','?limit=2','?start=00&limit=2','?start=-2&limit=2','?start=2.0&limit=2','?start=1&limit=2','?start=0&limit=25','?start=&limit=2','?start=0&limit=','?start=0&limit=2&start=0','?start=0&limit=2&limit=2','?start=0&limit=2&extra=1','?expand=body.storage','?Start=0&limit=2','?start=0&limit=2&'].map(q=>path+q);
 paths.push(path+'/',path.replace('MOCK','mock'),path.replace('MOCK','0MOCK'),path.replace('/page','/blogpost'));
 for(const id of ['20002','20003']) for(const q of ['?expand=','?expand=body.view','?expand=body.storage&expand=body.storage','?expand=body.storage&extra=1']) paths.push('/rest/api/content/'+id+q);
 for(const p of paths) for(const auth of [valid,null,'Bearer wrong']) assert.deepEqual(await get(p,auth),{status:404,body:fallback},p);
 for(const p of [path,path+'?start=0&limit=2','/rest/api/content/20002','/rest/api/content/20003?expand=body.storage']) for(const method of ['POST','PUT','PATCH','DELETE','HEAD']) for(const auth of [valid,null]) {const r=await get(p,auth,method);assert.equal(r.status,404);if(method!=='HEAD') assert.deepEqual(r.body,fallback);}
});
