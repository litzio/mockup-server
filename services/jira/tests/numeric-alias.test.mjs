import assert from 'node:assert/strict';
import test from 'node:test';
const base = process.env.JIRA_BASE_URL ?? 'http://127.0.0.1:8081';
test('U: numeric issue self aliases preserve fields, authentication and missing ID errors', async () => {
  const get = async (path, token = 'mock-jira-token') => {
    const response = await fetch(base + path, { headers: { Authorization: 'Bearer ' + token } });
    assert.equal(response.headers.get('connection'), 'close');
    return { status: response.status, body: await response.json() };
  };
  for (let n = 1; n <= 3; n++) {
    const path = '/rest/api/2/issue/1000' + n;
    assert.deepEqual(await get(path), await get('/rest/api/2/issue/MOCK-' + n));
    assert.equal((await get(path)).status, 200);
    assert.equal((await get(path, 'wrong')).status, 401);
  }
  assert.deepEqual(await get('/rest/api/2/issue/99999'), { status: 404, body: { errorMessages: ['Issue Does Not Exist'], errors: {} } });
  assert.equal((await get('/rest/api/2/issue/99999', 'wrong')).status, 401);
  for (const id of ['0', '010001', '-1', '1.0', '10001?x=1'])
    assert.equal((await get('/rest/api/2/issue/' + id)).body.mockError, 'UNSUPPORTED_REQUEST');
});
