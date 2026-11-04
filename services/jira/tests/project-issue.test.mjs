import assert from 'node:assert/strict';
import test from 'node:test';

const base = process.env.JIRA_BASE_URL ?? 'http://127.0.0.1:8081';
const valid = 'Bearer mock-jira-token';
async function request(path, auth = valid, method = 'GET') {
  const response = await fetch(base + path, {
    method, headers: auth === null ? {} : { Authorization: auth },
    signal: AbortSignal.timeout(5000),
  });
  assert.match(response.headers.get('content-type'), /application\/json/);
  return { status: response.status, body: await response.json() };
}
test('jira: coherent project list and single issue, stateless reads', async () => {
  const projects = await request('/rest/api/2/project');
  assert.equal(projects.status, 200);
  assert.deepEqual(projects.body, [{
    self: base + '/rest/api/2/project/10000', id: '10000',
    key: 'MOCK', name: 'Mock Project', projectTypeKey: 'software',
  }, {
    self: base + '/rest/api/2/project/11000', id: '11000',
    key: 'EMPTY', name: 'Empty Project', projectTypeKey: 'software',
  }]);
  const issue = await request('/rest/api/2/issue/MOCK-1');
  assert.equal(issue.status, 200);
  assert.equal(issue.body.id, '10001');
  assert.equal(issue.body.key, 'MOCK-1');
  assert.equal(issue.body.self, base + '/rest/api/2/issue/10001');
  assert.deepEqual(issue.body.fields.project, projects.body[0]);
  assert.equal(issue.body.fields.summary, 'Synthetic integration task');
  assert.equal(issue.body.fields.status.name, 'Open');
  assert.equal(issue.body.fields.issuetype.name, 'Task');
  const user = await request('/rest/api/2/myself');
  assert.deepEqual(issue.body.fields.assignee, user.body);
  assert.deepEqual(issue.body.fields.reporter, user.body);
  assert.deepEqual(await request('/rest/api/2/issue/MOCK-1'), issue);
});
for (const path of ['/rest/api/2/project', '/rest/api/2/issue/MOCK-1', '/rest/api/2/issue/MOCK-2', '/rest/api/2/issue/MOCK-3', '/rest/api/2/issue/MOCK-999', '/rest/api/2/issue/OTHER-1']) {
  test('jira: auth isolation ' + path, async () => {
    assert.ok([200, 404].includes((await request(path)).status));
    // Token alone changes case immediately after a valid request.
    for (const auth of ['Bearer MOCK-JIRA-TOKEN', null, 'Bearer wrong', 'Basic abc', 'Bearer mock-confluence-token']) {
      assert.deepEqual(await request(path, auth), {
        status: 401, body: { errorMessages: ['Authentication required'], errors: {} },
      });
    }
  });
}
test('jira: unknown keys have issue errors, distinct from unsupported requests', async () => {
  for (const key of ['MOCK-999', 'OTHER-1']) {
    assert.deepEqual(await request('/rest/api/2/issue/' + key), {
      status: 404, body: { errorMessages: ['Issue Does Not Exist'], errors: {} },
    });
  }
});
test('jira: reject unsupported methods, queries, IDs, keys and subresources', async () => {
  const paths = [
    '/rest/api/2/project?expand=description', '/rest/api/2/project?startAt=0',
    '/rest/api/2/project/10000', '/rest/api/2/project/',
    '/rest/api/2/issue/MOCK-1?fields=summary', '/rest/api/2/issue/MOCK-999?expand=names',
    '/rest/api/2/issue/010001', '/rest/api/2/issue/mock-1',
    '/rest/api/2/issue/MOCK-0', '/rest/api/2/issue/MOCK-1/transitions', '/rest/api/2/search',
  ].map(path => [path, 'GET']);
  for (const path of ['/rest/api/2/project', '/rest/api/2/issue/MOCK-1', '/rest/api/2/issue/MOCK-999']) {
    for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) paths.push([path, method]);
  }
  for (const [path, method] of paths) {
    for (const auth of [valid, null, 'Bearer wrong']) {
      const result = await request(path, auth, method);
      assert.equal(result.status, 404, method + ' ' + path);
      assert.equal(result.body.mockError, 'UNSUPPORTED_REQUEST');
    }
  }
});
