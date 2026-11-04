import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {fixture,get,state,assertAnonymous,productError,unsupported,valid} from './helpers.mjs';

test('C-GENERATED: canonical supplied fixture seeds reproduce checked-in WireMock data',()=>{
 execFileSync(process.execPath,[fileURLToPath(new URL('../tools/generate-acceptance.mjs',import.meta.url)),'--check'],{stdio:'pipe'});
});

test('C-LEGACY: prior accepted space/content paths remain documented canonical aliases',async()=>{
 await state('Started');for(const suffix of['','/content/page','/content/page?start=0&limit=2','/content/page?start=2&limit=2','/content/page?start=4&limit=2','/content/page?limit=1']){const alias=await get('/rest/api/space/~mock-user-a'+suffix);const canonical=await get('/rest/api/space/~mock.user-a'+suffix);assert.equal(alias.status,200);assert.deepEqual(alias.body.results??alias.body,canonical.body.results??canonical.body);}
 for(let n=1;n<=3;n++)for(const legacy of['2000'+n,'2200'+n])for(const suffix of['','?expand=body.storage','?expand=body.storage,version,space,history']){const alias=await get('/rest/api/content/'+legacy+suffix);assert.equal(alias.status,200);assert.deepEqual(alias,await get('/rest/api/content/3000'+n+suffix));}
});

test('C-ERROR: anonymous identity, protected auth precedence, errors, delay and reset',async t=>{
 await state('Started');t.after(()=>state('Started'));
 const paths=['/rest/api/user/current','/rest/api/space','/rest/api/space?limit=1','/rest/api/space?start=1&limit=2','/rest/api/space?start=3&limit=25','/rest/api/space?start=999999999&limit=1'];
 for(const key of[...fixture.spaces.map(s=>s.key),'~mock.absent','ABSENT']){paths.push('/rest/api/space/'+key);for(const q of['','?limit=1','?start=1&limit=2','?start=3&limit=25','?start=999999999&limit=1'])paths.push('/rest/api/space/'+key+'/content/page'+q);}
 for(const id of[...fixture.pages.map(p=>p.id),'999999999'])for(const q of['','?expand=body.storage','?expand=body.storage,version,space,history'])paths.push('/rest/api/content/'+id+q);
 const baseline=[];for(const path of paths){const r=await get(path);assert.equal(r.status,/ABSENT|absent|content\/999999999/.test(path)?404:200,path);baseline.push(r);}
 for(const[selected,status,message,reason]of[['Started'],['forbidden',403,'Forbidden','Forbidden'],['not-found',404,'No content found','Not Found'],['server-error',500,'Internal server error','Internal Server Error'],['delay']]){
  await state(selected);
  for(let i=0;i<paths.length;i++){
   const path=paths[i];const began=performance.now();const actual=await get(path);const elapsed=performance.now()-began;
   if(selected==='Started'||selected==='delay')assert.deepEqual(actual,baseline[i],path);else assert.deepEqual(actual,{status,body:productError(status,message,reason)},path);
   if(selected==='delay'){console.log('C delay '+path+': '+elapsed+'ms');assert.ok(elapsed>=1500,path+': '+elapsed+'ms');}
   for(const token of[null,'Bearer wrong','Bearer mock-jira-token']){const denied=await get(path,token);if(path==='/rest/api/user/current'){assert.equal(denied.status,200);assertAnonymous(denied.body);}else assert.deepEqual(denied,{status:401,body:productError(401,'Authentication required','Unauthorized')},path);}
  }
  for(const path of['/rest/api/space?limit=3','/rest/api/content/30001?expand=body.view','/rest/api/user/current?bad=1'])for(const token of[valid,null])assert.deepEqual(await get(path,token),{status:404,body:unsupported});
 }
 await state('Started');for(let i=0;i<paths.length;i++)assert.deepEqual(await get(paths[i]),baseline[i]);
});
