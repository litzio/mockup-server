import assert from 'node:assert/strict';
import Ajv from 'ajv';

export function compileSchemas(spec) {
 const ajv=new Ajv({strict:true,allErrors:true});
 for(const schema of Object.values(spec.schemas)) ajv.addSchema(schema);
 for(const schema of Object.values(spec.schemas)) ajv.getSchema(schema.$id);
 return (name,value)=>{
  const schema=spec.schemas[name];assert.ok(schema,'Unknown schema: '+name);
  const validate=ajv.getSchema(schema.$id);
  assert.ok(validate(value),'Schema '+name+' rejected value: '+JSON.stringify(validate.errors?.map(({instancePath,keyword})=>({instancePath,keyword}))));
 };
}
export function substitute(value,bindings) {
 if(typeof value==='string')return value.replace(/\{\{([^{}]+)\}\}/g,(_,key)=>{assert.ok(Object.hasOwn(bindings,key),'Unbound template '+key);return String(bindings[key]);});
 if(Array.isArray(value))return value.map(v=>substitute(v,bindings));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,substitute(v,bindings)]));
 return value;
}
export function expandCases(spec) {
 const result=[];
 for(const definition of spec.cases){
  let rows=[{}];
  for(const[key,values]of Object.entries(definition.matrix??{}))rows=rows.flatMap(row=>values.map(value=>({...row,[key]:value})));
  for(const row of rows){
   // queryRules has local placeholders (owner/resolutionClause), expanded later.
   const {queryRules,...body}=definition;
   result.push({...substitute(body,{...spec.bindings,...row}),definitionId:definition.id,row,queryRules});
  }
 }
 assert.equal(new Set(result.map(c=>c.id)).size,result.length,'Duplicate expanded case ID');
 return result;
}
export function atPath(value,path){return path.split('.').reduce((v,key)=>v?.[key],value);}
export function assertSubset(actual,expected) {
 if(expected&&typeof expected==='object'&&!Array.isArray(expected)){
  assert.ok(actual&&typeof actual==='object');for(const[key,value]of Object.entries(expected))assertSubset(actual[key],value);
 }else assert.deepEqual(actual,expected);
}

