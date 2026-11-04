import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,base,get,state,assertLinks,assertAnonymous,unsupported} from './helpers.mjs';

test('C-IDENTITY: known identity and anonymous HTTP200 are distinct for every invalid PAT',async()=>{
 await state('Started');const known=await get('/rest/api/user/current');assert.equal(known.status,200);
 for(const key of['type','username','userKey','displayName'])assert.equal(known.body[key],fixture.user[key]);
 assert.equal(known.body._links.self,base+'/rest/api/user/current');assert.ok(known.body.profilePicture);assert.ok(known.body._expandable);assertLinks(known.body);
 for(const token of[null,'Bearer wrong','Bearer mock-jira-token','Bearer MOCK-CONFLUENCE-TOKEN','bearer mock-confluence-token','Basic abc']){const r=await get('/rest/api/user/current',token);assert.equal(r.status,200);assertAnonymous(r.body);}
 for(const[path,method]of[['/rest/unsupported','GET'],['/rest/api/user/current','POST'],['/rest/api/user/current?expand=unknown','GET']])assert.deepEqual(await get(path,undefined,method),{status:404,body:unsupported});
 assert.deepEqual(await get('/rest/api/user/current'),known);
});
