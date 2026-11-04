import assert from 'node:assert/strict';
export class ResponseError extends Error {constructor(code){super(code);this.name='ResponseError';this.code=code;}}
export function localBase(value){
 const url=new URL(value);
 assert.equal(url.protocol,'http:');assert.ok(['127.0.0.1','localhost'].includes(url.hostname),'Only loopback mock services allowed');
 assert.equal(url.username,'');assert.equal(url.password,'');assert.equal(url.search,'');assert.equal(url.hash,'');
 assert.ok(['','/','/jira','/confluence','/custom-context'].includes(url.pathname),'Undeclared context');
 return url.href.replace(/\/$/,'');
}
export function consumer(base,pat) {
 base=localBase(base);assert.ok(['mock-jira-token','mock-confluence-token'].includes(pat),'Only fake PAT allowed');
 const root=new URL(base);
 const urlFor=(path,query)=>{
  const url=new URL(/^https?:/.test(path)?path:path.startsWith(root.pathname+'/rest/')&&root.pathname!=='/'?root.origin+path:base+path);
  assert.equal(url.origin,root.origin,'Refuse cross-origin API link');
  assert.ok(url.pathname.startsWith((root.pathname==='/'?'':root.pathname)+'/'),'Refuse link outside context');
  if(query)url.search=new URLSearchParams(query).toString();return url;
 };
 async function raw(path,{query,auth='valid',method='GET',timeoutMs=10000}={}){
  const token=auth==='valid'?pat:auth==='invalid'?'invalid-mock-token':auth==='other_product_token'?(pat==='mock-jira-token'?'mock-confluence-token':'mock-jira-token'):null;
  const start=performance.now();let response;
  try{response=await fetch(urlFor(path,query),{method,headers:token?{Authorization:'Bearer '+token}:{},redirect:'manual',signal:AbortSignal.timeout(timeoutMs)});}
  catch(error){throw new ResponseError(error.name==='TimeoutError'?'TIMEOUT':'NETWORK_ERROR');}
  const headerMs=performance.now()-start;
  if(response.status>=300&&response.status<400){await response.body?.cancel();return {status:response.status,body:null,ms:performance.now()-start,headerMs,redirect:true};}
  let body;
  try{body=await response.json();}catch(error){throw new ResponseError(error.name==='TimeoutError'?'TIMEOUT':'INVALID_JSON');}
  return {status:response.status,body,ms:performance.now()-start,headerMs};
 }
 async function read(path,options){const result=await raw(path,options);if(result.redirect)throw new ResponseError('REDIRECT_REFUSED');if(result.status!==200)throw new ResponseError('HTTP_'+result.status);return result.body;}
 return {base,raw,read,urlFor};
}
export function issueView(issue){
 assert.equal(typeof issue.key,'string');assert.equal(typeof issue.fields.summary,'string');assert.equal(typeof issue.fields.status.name,'string');
 assert.ok(['new','indeterminate','done'].includes(issue.fields.status.statusCategory.key));assert.ok(Number.isFinite(Date.parse(issue.fields.updated)));
 assert.ok(issue.fields.priority===null||(issue.fields.priority&&typeof issue.fields.priority.name==='string'));
 return {key:issue.key,summary:issue.fields.summary,status:issue.fields.status.name,category:issue.fields.status.statusCategory.key,priority:issue.fields.priority?.name??'No priority',updated:Date.parse(issue.fields.updated)};
}
export function authenticatedConfluenceUser(user){return user?.type==='known'&&typeof user.username==='string'&&user.username.length>0&&typeof user.userKey==='string'&&user.userKey.length>0;}
