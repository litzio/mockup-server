import {readFileSync,writeFileSync,readdirSync,lstatSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve,relative,sep} from 'node:path';
import {userInfo,hostname} from 'node:os';
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
export function privateTerms(file){
 const terms=[userInfo().username,hostname()].filter(v=>v.length>=4&&!['root','runner','mock-user','localhost'].includes(v));
 if(file){const data=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));for(const item of data.replacements??[])terms.push(item.original);for(const value of data.terms??[])terms.push(value);}
 return [...new Set(terms)];
}
export function auditFiles(root,paths,{denylistFile}={}){
 const terms=privateTerms(denylistFile),findings=[];let inspected=0;
 for(const path of paths){
  if(path.startsWith('node_modules/')||path.endsWith('.tar'))continue; // Pinned upstream binaries/licenses retain mandatory notices.
  const bytes=readFileSync(resolve(root,path));const text=(path.endsWith('.gz')?gunzipSync(bytes):bytes).toString('utf8');inspected++;
  const categories=[];
  if(terms.some(value=>text.toLowerCase().includes(value.toLowerCase())))categories.push('private-denylist');
  if(/(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----)/.test(text))categories.push('credential-pattern');
  if(/\b[A-Z]:[\\/]+Users[\\/]+(?!mock-user(?:[\\/\s"'`]|$)|Public(?:[\\/\s"'`]|$))[^\\/\s"']+/i.test(text))categories.push('non-synthetic-home-path');
  if(categories.length)findings.push({path,categories});
 }
 return {status:findings.length?'FAIL':'PASS',inspectedFiles:inspected,findings,policy:'Private local denylist is never printed or bundled; known identity/credential/home-path scan plus fixture oracle. Upstream image/dependency license bytes are preserved and identified separately; no universal secret-detection claim.'};
}
export function walkFiles(root){const files=[];function visit(dir){for(const entry of readdirSync(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())visit(path);else{if(!entry.isFile()||lstatSync(path).isSymbolicLink())throw new Error('Unsupported artifact entry');files.push(relative(root,path).split(sep).join('/'));}}}visit(root);return files;}
export function redactHistorical(root,denylistFile){
 const data=JSON.parse(readFileSync(denylistFile,'utf8').replace(/^\uFEFF/,''));const records=[];
 for(const item of data.inventory){
  const path=resolve(root,item.file);if(!path.startsWith(resolve(root)+sep)||!item.file.startsWith('docs/'))throw new Error('Redaction inventory outside docs');
  const original=readFileSync(path);let text=(item.file.endsWith('.gz')?gunzipSync(original):original).toString('utf8');const replacements=[];
  for(const rule of data.replacements){const count=text.split(rule.original).length-1;if(count){text=text.replaceAll(rule.original,rule.replacement);replacements.push({category:rule.category,count});}}
  if(!replacements.length)throw new Error('Inventory entry has no replacements: '+item.file);
  const sanitized=item.file.endsWith('.gz')?gzipSync(Buffer.from(text,'utf8')):Buffer.from(text,'utf8');writeFileSync(path,sanitized);
  records.push({path:item.file,originalSha256:sha256(original),sanitizedSha256:sha256(sanitized),replacements});
 }
 return {formatVersion:1,operation:'Explicitly labeled sanitized derivatives; Git history untouched. Original hashes identify pre-redaction bytes, not current artifacts.',preserved:'Commands, exit codes, numeric measurements, failed attempts and outcomes; only private home-path prefixes replaced with synthetic equivalent.',records};
}
