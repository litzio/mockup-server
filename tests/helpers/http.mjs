import assert from 'node:assert/strict';
import test from 'node:test';

export function currentUserContract(service, endpoint, port) {
  const base = process.env[service.toUpperCase() + '_BASE_URL'] ?? 'http://127.0.0.1:' + port;
  const request = (path, auth, method = 'GET') => fetch(base + path, {
    method, headers: auth === undefined ? {} : { Authorization: auth },
    signal: AbortSignal.timeout(5000),
  });
  test(service + ': PAT current user and unsupported requests', async () => {
    const valid = 'Bearer mock-' + service + '-token';
    const response = await request(endpoint, valid);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const user = await response.json();
    assert.equal(user.displayName, 'Mock User');
    if (service === 'jira') {
      assert.equal(user.name, 'mock-user');
      assert.equal(user.active, true);
      assert.equal(user.self, base + '/rest/api/2/user?username=mock-user');
    } else {
      assert.equal(user.type, 'known');
      assert.equal(user.username, 'mock-user');
      assert.equal(user._links.self, base + endpoint);
    }
    for (const auth of [undefined, 'Bearer wrong', valid.toUpperCase(), 'Basic abc', 'Bearer mock-' + (service === 'jira' ? 'confluence' : 'jira') + '-token']) {
      const failed = await request(endpoint, auth);
      assert.equal(failed.status, 401, auth ?? "missing PAT");
      const body = await failed.json();
      assert.ok(service === 'jira' ? Array.isArray(body.errorMessages) : body.statusCode === 401);
    }
    for (const [path, method] of [['/rest/unsupported', 'GET'], [endpoint, 'POST'], [endpoint + '?expand=unknown', 'GET']]) {
      const unsupported = await request(path, valid, method);
      assert.equal(unsupported.status, 404);
      assert.equal((await unsupported.json()).mockError, 'UNSUPPORTED_REQUEST');
    }
    assert.equal((await request(endpoint, valid)).status, 200);
  });
}
