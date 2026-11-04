import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
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
const spec=read('../../docs/acceptance/mockup-server-acceptance.json');
const seed=spec.fixtureModel.jira;
const users=Object.fromEntries(seed.users.map(u=>[u.name,{...u,self:`{{request.baseUrl}}/rest/api/2/user?username=${u.name}`} ]));
const me=users[spec.bindings.CURRENT_JIRA_USER];
save('__files/users/current.json',me);
const projects=seed.projects.map(p=>({...p,self:`{{request.baseUrl}}/rest/api/2/project/${p.id}`,projectTypeKey:'software',archived:false}));
save('__files/projects/list.json',projects);
const issues=seed.issues.map(s=>{
  const issue={id:s.id,key:s.key,self:`{{request.baseUrl}}/rest/api/2/issue/${s.id}`,fields:{
    summary:s.summary,description:'Synthetic issue for local integration testing.',project:projects[0],
    status:{name:s.status,statusCategory:{key:s.category,id:{new:2,indeterminate:4,done:3}[s.category]}},
    issuetype:{id:'3',name:'Task',subtask:false},
    assignee:s.assignee===null?null:users[s.assignee],reporter:users[s.reporter],
    updated:s.updated,priority:s.priority===null?null:{name:s.priority},
    resolution:s.resolution===null?null:{name:s.resolution},
    created:'2025-12-01T09:00:00.000+0000',resolutiondate:s.resolution===null?null:s.updated,
  }};
  save(`__files/issues/${s.key}.json`,issue);return issue;
});
// Keep the old project fixtures coherent with the expanded inventory.
for(const project of ['mock','empty']) for(const start of ['all',0,2,4]) {
  const list=project==='mock'?issues:[];
  save(`__files/search/${project}-${start}.json`,{startAt:start==='all'?0:start,maxResults:start==='all'?50:2,total:list.length,issues:start==='all'?list:list.slice(start,start+2)});
}
const headers={'Content-Type':'application/json','Connection':'close'};
const auth={Authorization:{equalTo:'Bearer mock-jira-token'}};
const authError={'status-code':401,message:'Authentication required'};
// Authentication-filter errors intentionally supersede the v1 resource schema.
for(const filename of readdirSync(resolve(root,'mappings'))) {
  if(filename==='v2-generated.json'||!filename.endsWith('.json'))continue;
  const resource=read('mappings/'+filename);
  for(const mapping of resource.mappings??[resource]) if(mapping.response.status===401) mapping.response.jsonBody=authError;
  save('mappings/'+filename,resource);
}
const mappings=[];
const response = file => ({status:200,headers,bodyFileName:file,transformers:['response-template']});
function add(request, normal, empty) {
  mappings.push({priority:1,request:{...request,headers:auth},response:normal});
  mappings.push({priority:10,request,response:{status:401,headers,jsonBody:authError}});
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
const fields=seed.fieldsProjection;
const projections={all:null,selected:fields,enriched:seed.enrichedFieldsProjection};
const projectIssue=(issue,projection)=>projection?{...issue,fields:Object.fromEntries(projection.split(',').map(f=>[f,issue.fields[f]]))}:issue;
for(const role of ['assignee','reporter']) for(const resolution of ['unresolved','resolved','all']) {
  const suffix=resolution==='unresolved'?' AND resolution = Unresolved':resolution==='resolved'?' AND resolution IS NOT EMPTY':'';
  const jql=`${role} = currentUser()${suffix} ORDER BY updated DESC`;
  const list=issues.filter(i=>i.fields[role]?.key===me.key && (resolution==='all'||(resolution==='resolved')===(i.fields.resolution!==null))).sort((a,b)=>Date.parse(b.fields.updated)-Date.parse(a.fields.updated));
  for(const [projection,projected] of Object.entries(projections)) for(const size of [1,2]) {
    const folder=`search-v2/${role}-${resolution}/${projection}/${size}`;
    for(let start=0;start<8;start++) {
      const page=list.slice(start,start+size).map(i=>projectIssue(i,projected));
      save(`__files/${folder}/${start}.json`,{startAt:start,maxResults:size,total:list.length,issues:page});
    }
    for(const start of ['absent','inside','outside']) for(const max of size===1?['1']:['absent','2|100']) {
      const names=['jql',...(projected?['fields']:[]),...(start==='absent'?[]:['startAt']),...(max==='absent'?[]:['maxResults'])];
      const queryParameters={jql:{equalTo:jql},...(projected?{fields:{equalTo:projected}}:{}),...(start==='absent'?{}:{startAt:{matches:start==='inside'?'[0-7]':'(?:[89]|[1-9][0-9]{1,8})'}}),...(max==='absent'?{}:{maxResults:{matches:max}})};
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
for(let n=4;n<=8;n++) add({method:'GET',urlPattern:`/rest/api/2/issue/(MOCK-${n}|${10000+n})`},response(`issues/MOCK-${n}.json`));
for(const [projection,selected] of Object.entries(projections).filter(([,value])=>value)) for(const issue of issues) {
  const file=`issues-selected/${projection}/${issue.key}.json`;
  save('__files/'+file,projectIssue(issue,selected));
  add({method:'GET',urlPattern:`/rest/api/2/issue/(${issue.key}|${issue.id})\\?${namePattern('fields')}=[^&]+`,queryParameters:{fields:{equalTo:selected}}},response(file));
}
// The acceptance's explicitly malformed JQL is a resource-level 400. Other
// undeclared expressions remain the documented mock unsupported boundary.
add({method:'GET',urlPattern:shape(['jql']),queryParameters:{jql:{equalTo:'assignee ='}}},{status:400,headers,jsonBody:{errorMessages:['Synthetic invalid JQL'],errors:{}}});
add({method:'GET',urlPattern:shape(['jql','startAt','maxResults','fields']),queryParameters:{jql:{equalTo:'project = EMPTY ORDER BY key ASC'},startAt:{matches:'(?:0|[1-9][0-9]{0,8})'},maxResults:{equalTo:'100'},fields:{equalTo:fields}}},{status:200,headers,body:'{"startAt":{{request.query.startAt}},"maxResults":2,"total":0,"issues":[]}',transformers:['response-template']});
save('mappings/v2-generated.json',{mappings});
console.log(`${check?'Verified':'Generated'} ${issues.length} issues, ${mappings.length} v2 mappings.`);
