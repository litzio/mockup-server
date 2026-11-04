import assert from 'node:assert/strict';
import { currentUserContract } from '../../../tests/helpers/http.mjs';
currentUserContract('jira', '/rest/api/2/myself', 8081, (user, base) => {
  assert.equal(user.displayName, 'Synthetic User A');
  assert.equal(user.name, 'mock-user-a');
  assert.equal(user.active, true);
  assert.equal(user.self, base + '/rest/api/2/user?username=mock-user-a');
}, body => assert.deepEqual(body, { 'status-code': 401, message: 'Authentication required' }));
