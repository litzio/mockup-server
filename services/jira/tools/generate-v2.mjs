import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

// Build ordinary WireMock resources. No runtime dependency or custom extension.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const read = path => JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const save = (path, data) => {
  const full = resolve(root, path), content=JSON.stringify(data,null,2)+'\n';
  if(check) { if(readFileSync(full,'utf8').replaceAll('\r\n','\n')!==content) throw new Error('Generated resource drift: '+path); }
  else { mkdirSync(dirname(full),{recursive:true}); writeFileSync(full,content); }
};
const me = read('__files/users/current.json');
const other = {...me, key:'mock-user-b-key', name:'mock-user-b', displayName:'Mock User B', emailAddress:'mock-user-b@example.invalid', self:'{{request.baseUrl}}/rest/api/2/user?username=mock-user-b'};
const originals = [1,2,3].map(n=>read(`__files/issues/MOCK-${n}.json`));
const issues = Array.from({length:18}, (_,i)=>{
  const n=i+1, issue=structuredClone(originals[i] ?? originals[0]);
  issue.id=String(10000+n); issue.key=`MOCK-${n}`; issue.self=`{{request.baseUrl}}/rest/api/2/issue/${issue.id}`;
  if(n>3) {
    issue.fields.summary=`Synthetic integration task ${n}`;
    issue.fields.description=`Synthetic issue ${n} for local integration testing.`;
    issue.fields.assignee=n%4===0?other:me;
    issue.fields.reporter=n%4===1?other:me;
    if(n===16) issue.fields.assignee=issue.fields.reporter=other;
    const status = n%3===0?['3','Done','done']:n%3===1?['2','In Progress','indeterminate']:['1','Open','new'];
    issue.fields.status={self:`{{request.baseUrl}}/rest/api/2/status/${status[0]}`,id:status[0],name:status[1],statusCategory:{key:status[2]}};
  } else issue.fields.status.statusCategory={key:'new'};
  issue.fields.updated=`2026-01-${String(n).padStart(2,'0')}T12:00:00.000+0000`;
  issue.fields.priority=n%3===0?null:{id:n%2===0?'2':'3',name:n%2===0?'High':'Medium'};
  issue.fields.resolution=n%2===0?{id:'1',name:'Fixed'}:null;
  save(`__files/issues/MOCK-${n}.json`,issue); return issue;
});
// Keep the old project fixtures coherent with the expanded inventory.
for(const project of ['mock','empty']) for(const start of ['all',0,2,4]) {
  const list=project==='mock'?issues:[];
  save(`__files/search/${project}-${start}.json`,{startAt:start==='all'?0:start,maxResults:start==='all'?50:2,total:list.length,issues:start==='all'?list:list.slice(start,start+2)});
}
const headers={'Content-Type':'application/json','Connection':'close'};
const auth={Authorization:{equalTo:'Bearer mock-jira-token'}};
const mappings=[];
const response = file => ({status:200,headers,bodyFileName:file,transformers:['response-template']});
function add(request, normal, empty) {
  mappings.push({priority:1,request:{...request,headers:auth},response:normal});
  mappings.push({priority:10,request,response:{status:401,headers,jsonBody:{errorMessages:['Authentication required'],errors:{}}}});
  for(const [state,status,message] of [['forbidden',403,'Forbidden'],['not-found',404,'Not found'],['server-error',500,'Internal server error']]) {
    mappings.push({priority:-20,scenarioName:'product-read',requiredScenarioState:state,request:{...request,headers:auth},response:{status,headers,jsonBody:{errorMessages:[message],errors:{}}}});
  }
  // Override the existing generic missing-issue delay mapping (-9) for new keys.
  mappings.push({priority:-10,scenarioName:'product-read',requiredScenarioState:'delay',request:{...request,headers:auth},response:{...normal,fixedDelayMilliseconds:1500}});
  if(empty) mappings.push({priority:-9,scenarioName:'product-read',requiredScenarioState:'empty-search',request:{...request,headers:auth},response:empty});
}
// Match allowed raw query names, encoded names, order and uniqueness. Values are
// independently compared after WireMock URL decoding. No extra/duplicate keys.
const namePattern=name=>[...name].map(c=>`(?:${c}|%${c.charCodeAt(0).toString(16).replace(/[a-f]/g,c=>`[${c}${c.toUpperCase()}]`)})`).join('');
function shape(names) {
  const keys=names.map(namePattern);
  const duplicates=keys.map(key=>`(?!(?:[^&]*&)*${key}=[^&]*(?:&[^&]*)*&${key}=)`).join('');
  return '/rest/api/2/search\\?'+duplicates+`(?:(?:${keys.join('|')})=[^&]+)(?:&(?:${keys.join('|')})=[^&]+){${names.length-1}}`;
}
const fields='summary,status,priority,updated';
for(const role of ['assignee','reporter']) for(const resolution of ['unresolved','resolved','all']) {
  const suffix=resolution==='unresolved'?' AND resolution = Unresolved':resolution==='resolved'?' AND resolution IS NOT EMPTY':'';
  const jql=`${role} = currentUser()${suffix} ORDER BY updated DESC`;
  const list=issues.filter(i=>i.fields[role].key===me.key && (resolution==='all'||(resolution==='resolved')===(i.fields.resolution!==null))).reverse();
  for(const projected of [false,true]) for(const size of [1,2]) {
    const folder=`search-v2/${role}-${resolution}/${projected?'selected':'all'}/${size}`;
    for(let start=0;start<18;start++) {
      const page=list.slice(start,start+size).map(i=>projected?{...i,fields:Object.fromEntries(fields.split(',').map(f=>[f,i.fields[f]]))}:i);
      save(`__files/${folder}/${start}.json`,{startAt:start,maxResults:size,total:list.length,issues:page});
    }
    for(const start of ['absent','inside','outside']) for(const max of size===1?['1']:['absent','2|100']) {
      const names=['jql',...(projected?['fields']:[]),...(start==='absent'?[]:['startAt']),...(max==='absent'?[]:['maxResults'])];
      const queryParameters={jql:{equalTo:jql},...(projected?{fields:{equalTo:fields}}:{}),...(start==='absent'?{}:{startAt:{matches:start==='inside'?'(?:[0-9]|1[0-7])':'(?:1[89]|[2-9][0-9]|[1-9][0-9]{2,8})'}}),...(max==='absent'?{}:{maxResults:{matches:max}})};
      const file=start==='absent'?'0':start==='inside'?'{{request.query.startAt}}':'outside';
      const emptyBody=`{"startAt":${start==='absent'?'0':'{{request.query.startAt}}'},"maxResults":${size},"total":0,"issues":[]}`;
      const normal=start==='outside'?{status:200,headers,body:emptyBody.replace('"total":0',`"total":${list.length}`),transformers:['response-template']}:response(`${folder}/${file}.json`);
      add({method:'GET',urlPattern:shape(names),queryParameters},normal,{status:200,headers,body:emptyBody,transformers:['response-template']});
    }
  }
}
// Additional project offsets retain the existing project search contract and
// make every issue reachable; existing 0/2/4/all files remain the same routes.
for(const project of ['MOCK','EMPTY']) for(const start of [6,8,10,12,14,16,18,20]) {
  const list=project==='MOCK'?issues:[];
  const file=`search/${project.toLowerCase()}-${start}.json`;
  save(`__files/${file}`,{startAt:start,maxResults:2,total:list.length,issues:list.slice(start,start+2)});
  add({method:'GET',urlPattern:shape(['jql','startAt','maxResults']),queryParameters:{jql:{equalTo:`project = ${project} ORDER BY key ASC`},startAt:{equalTo:String(start)},maxResults:{equalTo:'2'}}},response(file));
}
for(let n=4;n<=18;n++) add({method:'GET',urlPattern:`/rest/api/2/issue/(MOCK-${n}|${10000+n})`},response(`issues/MOCK-${n}.json`));
save('mappings/v2-generated.json',{mappings});
console.log(`${check?'Verified':'Generated'} ${issues.length} issues, ${mappings.length} v2 mappings.`);
