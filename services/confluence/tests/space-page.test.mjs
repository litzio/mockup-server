import assert from 'node:assert/strict';
import test from 'node:test';
const base=process.env.CONFLUENCE_BASE_URL ?? 'http://127.0.0.1:8082';
const valid='Bearer mock-confluence-token';
async function request(path,auth=valid,method='GET') {
  const response=await fetch(base+path,{method,headers:auth===null?{}:{Authorization:auth},signal:AbortSignal.timeout(5000)});
  assert.match(response.headers.get('content-type'),/application\/json/);
  assert.equal(response.headers.get('connection'),'close');
  return {status:response.status,body:await response.json()};
}
test('confluence: coherent fixed space list, page and storage expansion, stateless reads',async()=>{
  const list=await request('/rest/api/space');
  assert.equal(list.status,200);
  assert.equal(list.body.start,0); assert.equal(list.body.limit,25); assert.equal(list.body.size,3);
  assert.equal(list.body.results.length,list.body.size);
  assert.deepEqual(list.body._links,{base,context:'',self:base+'/rest/api/space'});
  assert.equal(list.body.results[0].key,'MOCK');
  assert.equal(list.body._links.next,undefined); assert.equal(list.body._links.prev,undefined);
  const page=await request('/rest/api/content/20001');
  assert.equal(page.status,200); assert.equal(page.body.id,'20001');
  assert.equal(page.body.type,'page'); assert.equal(page.body.status,'current');
  assert.equal(page.body.title,'Synthetic integration page');
  assert.deepEqual(page.body.space,list.body.results[0]);
  assert.equal(page.body._links.self,base+'/rest/api/content/20001');
  const user=await request('/rest/api/user/current');
  assert.deepEqual(page.body.history.createdBy,user.body); assert.deepEqual(page.body.version.by,user.body);
  assert.equal(page.body.version.number,1); assert.equal(page.body.body,undefined);
  const expanded=await request('/rest/api/content/20001?expand=body.storage');
  assert.equal(expanded.status,200);
  assert.deepEqual(expanded.body.body,{storage:{value:'<p>Synthetic integration page body.</p>',representation:'storage'}});
  const {body,...metadata}=expanded.body; assert.deepEqual(metadata,page.body);
  assert.deepEqual(await request('/rest/api/content/20001'),page);
});
for(const path of ['/rest/api/space','/rest/api/content/20001','/rest/api/content/20001?expand=body.storage','/rest/api/content/99999','/rest/api/content/99999?expand=body.storage']) {
  test('confluence: auth isolation '+path,async()=>{
    assert.ok([200,404].includes((await request(path)).status));
    for(const auth of ['Bearer MOCK-CONFLUENCE-TOKEN',null,'Bearer wrong','Basic abc','Bearer mock-jira-token','bearer mock-confluence-token'])
      assert.deepEqual(await request(path,auth),{status:401,body:{statusCode:401,message:'Authentication required',reason:'Unauthorized'}});
  });
}
test('confluence: unknown numeric pages have product-shaped synthetic 404',async()=>{
  for(const path of ['/rest/api/content/99999','/rest/api/content/99999?expand=body.storage'])
    assert.deepEqual(await request(path),{status:404,body:{statusCode:404,message:'No content found',reason:'Not Found'}});
});
test('confluence: unsupported methods, paths and queries never succeed or expose data',async()=>{
  const paths=['/rest/api/space?start=0','/rest/api/space?limit=25','/rest/api/space?spaceKey=MOCK','/rest/api/space?expand=description','/rest/api/space/','/wiki/rest/api/space','/rest/api/content','/rest/api/content/abc','/rest/api/content/0','/rest/api/content/020001','/rest/api/content/20001/','/rest/api/content/20001/child','/rest/api/content/search','/rest/api/content/20001?expand=body.view','/rest/api/content/20001?expand=','/rest/api/content/20001?status=current','/rest/api/content/20001?expand=body.storage&limit=1','/rest/api/content/20001?expand=body.storage&expand=body.storage','/rest/api/content/99999?expand=unknown'].map(p=>[p,'GET']);
  for(const path of ['/rest/api/space','/rest/api/content/20001','/rest/api/content/20001?expand=body.storage','/rest/api/content/99999'])
    for(const method of ['POST','PUT','DELETE','PATCH']) paths.push([path,method]);
  for(const [path,method] of paths) for(const auth of [valid,null,'Bearer wrong'])
    assert.deepEqual(await request(path,auth,method),{status:404,body:{mockError:'UNSUPPORTED_REQUEST',message:'This request is outside the supported mock contract.'}},method+' '+path);
});
