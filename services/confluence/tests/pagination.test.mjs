import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,get,state,assertLinks,productError,unsupported,valid} from './helpers.mjs';

async function walk(path,limit,expected){
 let next=path+`?start=0&limit=${limit}`;let prior;const visited=[];let calls=0;
 while(next){assert.ok(++calls<=expected.length+2,'no cycles');const page=await get(next);assert.equal(page.status,200);assert.equal(page.body.start,visited.length);assert.equal(page.body.limit,limit);assert.equal(page.body.size,page.body.results.length);assert.ok(page.body.size<=page.body.limit);assertLinks(page.body);assert.deepEqual(await get(page.body._links.self),page);
  if(prior)assert.deepEqual(await get(page.body._links.prev),prior);else assert.equal(page.body._links.prev,undefined);
  for(const item of page.body.results){const detail=await get(item._links.self);assert.equal(detail.status,200);for(const key of['id','type','status','title','key','name'])if(Object.hasOwn(item,key))assert.deepEqual(detail.body[key],item[key]);visited.push(item);}
  if(page.body._links.next)assert.equal(new URL(page.body._links.next,'http://mock.example.invalid').searchParams.get('limit'),String(limit));
  prior=page;next=page.body._links.next;
 }
 assert.deepEqual(visited.map(i=>i.id),expected.map(i=>i.id));assert.equal(new Set(visited.map(i=>i.id)).size,expected.length);
 for(const start of[expected.length,expected.length+limit,999999999]){const empty=await get(path+`?start=${start}&limit=${limit}`);assert.equal(empty.status,200);assert.equal(empty.body.start,start);assert.equal(empty.body.limit,limit);assert.equal(empty.body.size,0);assert.deepEqual(empty.body.results,[]);assert.equal(empty.body._links.next,undefined);assert.equal(empty.body._links.prev,undefined);assertLinks(empty.body);}
}

test('C-SPACES-PAGINATION: limits1/2/25 visit canonical spaces exactly once',async()=>{
 await state('Started');const all=await get('/rest/api/space');assert.equal(all.status,200);assert.deepEqual(all.body.results.map(s=>[s.id,s.key]),fixture.spaces.map(s=>[s.id,s.key]));assert.equal(all.body.start,0);assert.equal(all.body.limit,25);assert.equal(all.body.size,fixture.spaces.length);assertLinks(all.body);
 for(const limit of[1,2,25]){await walk('/rest/api/space',limit,fixture.spaces);assert.deepEqual((await get('/rest/api/space?limit='+limit)).body.results,all.body.results.slice(0,limit));}
});

test('C-PAGES: personal/global/empty × limits1/2/25, stable identity and storage traversal',async()=>{
 for(const space of fixture.spaces){const path='/rest/api/space/'+space.key;const detail=await get(path);assert.equal(detail.status,200);for(const key of['id','key','name','type'])assert.equal(detail.body[key],space[key]);assert.equal(detail.body.status,'current');assertLinks(detail.body);
  const expected=fixture.pages.filter(p=>p.spaceKey===space.key);for(const limit of[1,2,25])await walk(path+'/content/page',limit,expected);
  const all=await get(path+'/content/page');assert.equal(all.body.size,expected.length);assert.deepEqual(all.body.results.map(p=>p.id),expected.map(p=>p.id));for(const item of all.body.results){assert.equal(item.body,undefined);assert.deepEqual(item.space,detail.body);const expanded=await get(item._links.self+'?expand=body.storage');assert.equal(expanded.body.body.storage.value,expected.find(p=>p.id===item.id).storage);}
 }
});

test('C-ENCODING: tilde/value/name encodings and parameter order preserve identities',async()=>{
 const base='/rest/api/space/~mock.user-a';for(const suffix of['','/content/page','/content/page?limit=1','/content/page?start=2&limit=2']){const plain=await get(base+suffix);for(const encoded of['%7E','%7e']){const r=await get(base.replace('~',encoded)+suffix);assert.equal(r.status,200);assert.deepEqual(r.body.results??r.body,plain.body.results??plain.body);}}
 const plain=await get(base+'/content/page?start=1&limit=2');const encoded=await get(base+'/content/page?%6Cimit=%32&%73tart=%31');assert.equal(encoded.status,200);assert.deepEqual(encoded.body.results,plain.body.results);assert.equal(encoded.body.start,plain.body.start);assert.equal(encoded.body.limit,plain.body.limit);
 for(const q of['?start=-1&limit=1','?start=1.0&limit=1','?limit=1&limit=1','?limit=1&%6Cimit=1','?start=1&start=1&limit=1','?limit=1&extra=1','?limit=1&','?Limit=1','?expand=body.storage'])for(const token of[valid,null])assert.deepEqual(await get(base+'/content/page'+q,token),{status:404,body:unsupported});
 for(const path of['/rest/api/space/ABSENT','/rest/api/space/~mock.absent','/rest/api/space/~mock.absent/content/page?limit=1']){assert.deepEqual(await get(path),{status:404,body:productError(404,'No content found','Not Found')});assert.deepEqual(await get(path,null),{status:401,body:productError(401,'Authentication required','Unauthorized')});}
});
