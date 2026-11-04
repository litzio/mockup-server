import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Build ordinary WireMock files from the supplied, immutable acceptance seeds.
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const check=process.argv.includes('--check');
const spec=JSON.parse(readFileSync(resolve(root,'../../docs/acceptance/mockup-server-acceptance.json'),'utf8'));
const seeds=spec.fixtureModel.confluence;
const outputs=new Set();
const save=(path,value)=>{const full=resolve(root,path),body=JSON.stringify(value,null,2)+'\n';outputs.add(full);if(check){if(readFileSync(full,'utf8').replaceAll('\r\n','\n')!==body)throw Error('Generated resource drift: '+path);}else{mkdirSync(dirname(full),{recursive:true});writeFileSync(full,body);}};
const links=path=>({base:'{{request.baseUrl}}',context:'',self:'{{request.baseUrl}}'+path});
const picture={path:'/images/icons/profilepics/default.svg',width:48,height:48,isDefault:true};
const user={...seeds.user,profilePicture:picture,_links:links('/rest/api/user/current'),_expandable:{status:''}};
const anonymous={type:'anonymous',displayName:'Anonymous',profilePicture:picture,_links:links('/rest/api/user/current')};
save('__files/users/current.json',user);save('__files/users/anonymous.json',anonymous);
const spaces=seeds.spaces.map(s=>({...s,status:'current',_links:links('/rest/api/space/'+s.key)}));
for(const space of spaces)save(`__files/spaces/${space.key}.json`,space);
const pages=seeds.pages.map(seed=>{
 const identity={id:seed.id,type:'page',status:'current',title:seed.title,_links:links('/rest/api/content/'+seed.id)};
 const metadata={space:spaces.find(s=>s.key===seed.spaceKey),history:{latest:true,createdBy:user,createdDate:'2026-01-01T00:00:00.000Z'},version:{number:seed.version,by:user,when:'2026-01-01T00:00:00.000Z',minorEdit:false}};
 const body={storage:{value:seed.storage,representation:'storage'}};
 const page={...identity,...metadata};
 save(`__files/pages/${seed.id}.json`,page);
 save(`__files/pages/${seed.id}-storage.json`,{...identity,body});
 save(`__files/pages/${seed.id}-combined.json`,{...page,body});
 return page;
});
const headers={'Content-Type':'application/json',Connection:'close'};
const auth={Authorization:{equalTo:'Bearer mock-confluence-token'}};
const mappings=[];
const error=(status,message,reason)=>({status,headers,jsonBody:{statusCode:status,message,reason}});
function route(request,response,priority=1){const normal={priority,request:{...request,headers:auth},response:{headers,...response}};mappings.push(normal,{...structuredClone(normal),priority:priority-10,scenarioName:'product-read',requiredScenarioState:'delay',response:{...structuredClone(normal.response),fixedDelayMilliseconds:1500}});}
function boundary(request,identity=false){mappings.push({priority:10,request,response:identity?{status:200,headers,bodyFileName:'users/anonymous.json',transformers:['response-template']}:error(401,'Authentication required','Unauthorized')});for(const[state,status,message,reason]of[['forbidden',403,'Forbidden','Forbidden'],['not-found',404,'No content found','Not Found'],['server-error',500,'Internal server error','Internal Server Error']])mappings.push({priority:-20,scenarioName:'product-read',requiredScenarioState:state,request:{...request,headers:auth},response:error(status,message,reason)});}
const exact=value=>({hasExactly:[{equalTo:String(value)}]});
const matches=value=>({hasExactly:[{matches:value}]});
const namePattern=name=>[...name].map(c=>`(?:${c}|%${c.charCodeAt(0).toString(16).replace(/[a-f]/g,c=>`[${c}${c.toUpperCase()}]`)})`).join('');
function shape(path,names){if(!names.length)return path;const keys=names.map(namePattern);const unique=keys.map(key=>`(?!(?:[^&]*&)*${key}=[^&]*(?:&[^&]*)*&${key}=)`).join('');return path+'\\?'+unique+`(?:(?:${keys.join('|')})=[^&]+)(?:&(?:${keys.join('|')})=[^&]+){${names.length-1}}`;}
const keyPattern=key=>key.startsWith('~')?'(?:~|%7[eE])'+key.slice(1).replaceAll('.','\\.'):key;
const anySpace='(?:[A-Z][A-Z0-9_]*|(?:~|%7[eE])[a-z][a-z0-9.-]*)';
const number='(?:0|[1-9][0-9]{0,8})';
const identityRequest={method:'GET',url:'/rest/api/user/current'};
boundary(identityRequest,true);route(identityRequest,{status:200,bodyFileName:'users/current.json',transformers:['response-template']});
const detailRequest={method:'GET',urlPattern:'/rest/api/space/'+anySpace};
boundary(detailRequest);route(detailRequest,error(404,'No content found','Not Found'),5);
for(const space of spaces){const key=space.key==='~mock.user-a'?'(?:'+keyPattern(space.key)+'|'+keyPattern('~mock-user-a')+')':keyPattern(space.key);route({method:'GET',urlPattern:'/rest/api/space/'+key},{status:200,bodyFileName:`spaces/${space.key}.json`,transformers:['response-template']});}
const expansions=[['',null],['-storage','body.storage'],['-combined','body.storage,version,space,history']];
for(const[suffix,expand]of expansions){
 const request={method:'GET',urlPattern:shape('/rest/api/content/[1-9][0-9]*',expand?['expand']:[])};if(expand)request.queryParameters={expand:exact(expand)};
 boundary(request);route(request,error(404,'No content found','Not Found'),5);
 for(const page of pages){const aliases=page.id.startsWith('3000')?[page.id,'2000'+page.id.at(-1),'2200'+page.id.at(-1)]:[page.id];const known={...request,urlPattern:shape('/rest/api/content/(?:'+aliases.join('|')+')',expand?['expand']:[])};route(known,{status:200,bodyFileName:`pages/${page.id}${suffix}.json`,transformers:['response-template']});}
}
// List shapes are bounded to limit 1/2/25 and safe canonical integer offsets.
// Only nonempty offsets need static fixture pages; later offsets render empty lists.
const queryShapes=[[],['start'],['limit'],['start','limit']];
function listRequest(path,names,limit,start){const request={method:'GET',urlPattern:shape(path,names)};const params={};if(names.includes('start'))params.start=start===undefined?matches(number):typeof start==='number'?exact(start):matches(start);if(names.includes('limit'))params.limit=limit===undefined?matches('(?:1|2|25)'):exact(limit);if(names.length)request.queryParameters=params;return request;}
for(const path of['/rest/api/space','/rest/api/space/'+anySpace+'/content/page'])for(const names of queryShapes){const request=listRequest(path,names);boundary(request);if(path.endsWith('/content/page'))route(request,error(404,'No content found','Not Found'),5);}
function collection(path,items){for(const names of queryShapes)for(const limit of names.includes('limit')?[1,2,25]:[25]){
 const starts=names.includes('start')?Array.from({length:Math.max(items.length,1)},(_,i)=>i):[0];
 for(const start of starts){const results=items.slice(start,start+limit);const pageLinks=links('');pageLinks.self='{{request.baseUrl}}{{{request.url}}}';if(results.length){if(start+limit<items.length)pageLinks.next=path+`?start=${start+limit}&limit=${limit}`;if(start>0)pageLinks.prev=path+`?start=${Math.max(0,start-limit)}&limit=${limit}`;}
  route(listRequest(keyPatternPath(path),names,limit,start),{status:200,jsonBody:{results,start,limit,size:results.length,_links:pageLinks},transformers:['response-template']});
 }
 if(names.includes('start')){const outside='(?!(?:'+starts.join('|')+')$)'+number;const body=`{"results":[],"start":{{request.query.start}},"limit":${limit},"size":0,"_links":{"base":"{{request.baseUrl}}","context":"{{parameters.context}}","self":"{{request.baseUrl}}{{{request.url}}}"}}`;route(listRequest(keyPatternPath(path),names,limit,outside),{status:200,body,transformers:['response-template'],transformerParameters:{context:''}});}
}}
function keyPatternPath(path){return path.replace(/(?<=\/space\/)~[^/]+/,key=>keyPattern(key));}
collection('/rest/api/space',spaces);
for(const space of spaces){const list=pages.filter(p=>p.space.key===space.key).map(p=>Object.fromEntries(['id','type','status','title','space','_links'].map(k=>[k,p[k]])));collection('/rest/api/space/'+space.key+'/content/page',list);if(space.key==='~mock.user-a')collection('/rest/api/space/~mock-user-a/content/page',list);}
mappings.push({priority:100,request:{},response:{status:404,headers,jsonBody:{mockError:'UNSUPPORTED_REQUEST',message:'This request is outside the supported mock contract.'}}});
save('mappings/acceptance-generated.json',{mappings});
if(check){const visit=directory=>{for(const item of readdirSync(directory,{withFileTypes:true})){const full=resolve(directory,item.name);if(item.isDirectory())visit(full);else if(!outputs.has(full))throw Error('Unexpected generated resource: '+relative(root,full));}};visit(resolve(root,'mappings'));visit(resolve(root,'__files'));}
console.log(`${check?'Verified':'Generated'} canonical Confluence fixtures and ${mappings.length} mappings.`);
