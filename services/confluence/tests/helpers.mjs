import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
export const specification=JSON.parse(readFileSync(new URL('../../../docs/acceptance/mockup-server-acceptance.json',import.meta.url),'utf8'));
export const fixture=specification.fixtureModel.confluence;
export const base=(process.env.CONFLUENCE_BASE_URL??'http://127.0.0.1:8082').replace(/\/$/,'');
export const origin=new URL(base).origin;
export const context=new URL(base).pathname.replace(/\/$/,'');
export const valid='Bearer mock-confluence-token';
export const productError=(statusCode,message,reason)=>({statusCode,message,reason});
export const unsupported={mockError:'UNSUPPORTED_REQUEST',message:'This request is outside the supported mock contract.'};
export async function get(path,auth=valid,method='GET'){
 const url=path.startsWith('http')?path:context&&path.startsWith(context+'/rest/')?origin+path:base+path;
 const response=await fetch(url,{method,headers:auth===null?{}:{Authorization:auth},signal:AbortSignal.timeout(10000)});
 assert.match(response.headers.get('content-type'),/application\/json/);
 if(method==='HEAD')assert.ok(response.headers.get('connection').split(',').every(v=>v.trim()==='close'));else assert.equal(response.headers.get('connection'),'close');
 return {status:response.status,body:method==='HEAD'?null:await response.json()};
}
export async function state(value){const url=origin+'/__admin/scenarios/'+(value==='Started'?'reset':'product-read/state');const r=await fetch(url,{method:value==='Started'?'POST':'PUT',headers:{'Content-Type':'application/json'},body:value==='Started'?undefined:JSON.stringify({state:value}),signal:AbortSignal.timeout(5000)});assert.equal(r.ok,true);const states=await(await fetch(origin+'/__admin/scenarios',{signal:AbortSignal.timeout(5000)})).json();assert.equal(states.scenarios.find(s=>s.name==='product-read').state,value);}
export function assertLinks(value){if(!value||typeof value!=='object')return;for(const[key,item]of Object.entries(value)){if(key==='self'&&typeof item==='string')assert.ok(item.startsWith(base+'/rest/'),item);if(key==='base')assert.equal(item,origin);if(key==='context')assert.equal(item,context);if(key==='next'||key==='prev')assert.ok(item.startsWith(context+'/rest/'),item);assertLinks(item);}}
export function assertAnonymous(body){assert.equal(body.type,'anonymous');assert.equal(Object.hasOwn(body,'username'),false);assert.equal(Object.hasOwn(body,'userKey'),false);assert.equal(typeof body.displayName,'string');assertLinks(body);}
