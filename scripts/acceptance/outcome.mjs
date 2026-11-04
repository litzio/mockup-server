// Exit 0 means only that the executable server/standalone work passed. It never
// means the original real-consumer gates passed. Exemptions are exact and checked.
export function serverFailures(report,expectedIds){
 const ids=report.cases.map(c=>c.expandedCaseId);
 const failures=[];
 if(ids.length!==expectedIds.length||new Set(ids).size!==ids.length||expectedIds.some(id=>!ids.includes(id)))failures.push('CASE_COVERAGE');
 if(report.cleanupFailure)failures.push('CLEANUP');
 for(const c of report.cases){
  const id=c.expandedCaseId,observations=(c.attempts??[]).flatMap(a=>a.observations??[]);
  let allowed=false;
  if(id.startsWith('I-REAL-CONSUMER-'))allowed=c.status==='NOT_RUN';
  else if(c.status==='PASS')allowed=(c.assertions??[]).every(a=>a.status==='PASS');
  else if(c.status==='NOT_RUN'){
   if(['O-PRIVACY','O-OFFLINE-LIFECYCLE'].includes(id))allowed=true;
   else {const match=/^M-CONTEXT-(jira|confluence)-(.*)$/.exec(id);if(match&&report.baseUrls?.[match[1]]){const actual=new URL(report.baseUrls[match[1]]).pathname.replace(/\/$/,'');allowed=match[2]!==actual;}}
  }else if(c.status==='BLOCKED'){
   if(id==='J-NULLABLE-FIELDS')allowed=observations.some(o=>o.standaloneNullSafeFormatter==='PASS')&&(c.assertions??[]).every(a=>a.text==='Client renders missing priority without crashing'?a.status==='NOT_RUN':a.status==='PASS');
   if(id==='O-REPEATABILITY')allowed=Boolean(report.snapshots?.jira&&report.snapshots?.confluence)&&observations.some(o=>o.readResetRepeat==='PASS');
  }
  if(!allowed)failures.push(id+':'+c.status);
 }
 return failures;
}
