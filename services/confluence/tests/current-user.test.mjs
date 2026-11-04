import assert from 'node:assert/strict';
import { currentUserContract } from '../../../tests/helpers/http.mjs';
currentUserContract('confluence', '/rest/api/user/current', 8082, (user, base) => {
  assert.equal(user.displayName, 'Mock User');
  assert.equal(user.type, 'known');
  assert.equal(user.username, 'mock-user');
  assert.equal(user._links.self, base + '/rest/api/user/current');
}, body => assert.equal(body.statusCode, 401));
