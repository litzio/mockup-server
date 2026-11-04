import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,get,state,assertLinks,productError,unsupported,valid} from './helpers.mjs';

test('C-PAGE: default metadata, storage-only and explicitly combined expansions',async()=>{
 await state('Started');const current=(await get('/rest/api/user/current')).body;
 for(const seed of fixture.pages){
  const path='/rest/api/content/'+seed.id;const basic=await get(path);assert.equal(basic.status,200);assert.equal(basic.body.id,seed.id);assert.equal(basic.body.type,'page');assert.equal(basic.body.status,'current');assert.equal(basic.body.title,seed.title);
  assert.equal(basic.body.space.key,seed.spaceKey);assert.deepEqual(basic.body.history.createdBy,current);assert.deepEqual(basic.body.version.by,current);assert.equal(basic.body.version.number,seed.version);assert.equal(Object.hasOwn(basic.body,'body'),false);assertLinks(basic.body);
  const storage=await get(path+'?expand=body%2Estorage');assert.equal(storage.status,200);assert.deepEqual(storage.body.body,{storage:{value:seed.storage,representation:'storage'}});
  for(const key of['id','type','status','title','_links'])assert.deepEqual(storage.body[key],basic.body[key]);
  // Supplied observed contract replaces default expansions. Full metadata equality
  // is retained below for the explicit combined-expansion request.
  for(const key of['space','history','version'])assert.equal(Object.hasOwn(storage.body,key),false);
  const combined=await get(path+'?expand=body.storage%2Cversion%2Cspace%2Chistory');assert.equal(combined.status,200);const{body,...metadata}=combined.body;assert.deepEqual(metadata,basic.body);assert.deepEqual(body,storage.body.body);
  assert.deepEqual(await get(path),basic);
 }
});

test('C-PAGE: protected reads require PAT and missing pages have a product error',async()=>{
 for(const id of[...fixture.pages.map(p=>p.id),'999999999'])for(const expand of['','?expand=body.storage','?expand=body.storage,version,space,history']){
  const path='/rest/api/content/'+id+expand;const normal=await get(path);assert.equal(normal.status,id==='999999999'?404:200);if(normal.status===404)assert.deepEqual(normal.body,productError(404,'No content found','Not Found'));
  for(const token of[null,'Bearer wrong','Bearer mock-jira-token','Bearer MOCK-CONFLUENCE-TOKEN','Basic abc'])assert.deepEqual(await get(path,token),{status:401,body:productError(401,'Authentication required','Unauthorized')});
 }
});

test('C-UNSUPPORTED: undeclared page/space requests and writes never become success',async()=>{
 const paths=['/rest/api/space?spaceKey=MOCK','/rest/api/space?expand=description','/rest/api/space?limit=0','/rest/api/space?limit=3','/rest/api/space?limit=1&limit=1','/rest/api/space?start=00&limit=1','/rest/api/space?start=1000000000&limit=1','/rest/api/space/','/rest/api/content','/rest/api/content/abc','/rest/api/content/0','/rest/api/content/030001','/rest/api/content/30001/','/rest/api/content/30001/child','/rest/api/content/search','/rest/api/content/30001?expand=body.view','/rest/api/content/30001?expand=','/rest/api/content/30001?status=current','/rest/api/content/30001?expand=body.storage&limit=1','/rest/api/content/30001?expand=body.storage&expand=body.storage','/rest/api/content/999999999?expand=unknown'];
 for(const path of paths)for(const token of[valid,null,'Bearer wrong'])assert.deepEqual(await get(path,token),{status:404,body:unsupported},path);
 for(const path of['/rest/api/space','/rest/api/space/~mock.user-a','/rest/api/content/30001','/rest/api/content/30001?expand=body.storage'])for(const method of['POST','PUT','DELETE','PATCH','HEAD']){const r=await get(path,valid,method);assert.equal(r.status,404);if(method!=='HEAD')assert.deepEqual(r.body,unsupported);}
});
