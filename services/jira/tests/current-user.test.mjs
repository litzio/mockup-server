import assert from 'node:assert/strict';
import { currentUserContract } from '../../../tests/helpers/http.mjs';
currentUserContract('jira', '/rest/api/2/myself', 8081, (user, base) => {
  assert.equal(user.displayName, 'Mock User');
  assert.equal(user.name, 'mock-user');
  assert.equal(user.active, true);
  assert.equal(user.self, base + '/rest/api/2/user?username=mock-user');
}, body => assert.deepEqual(body, { errorMessages: ['Authentication required'], errors: {} }));
