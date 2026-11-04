import assert from 'node:assert/strict';
import test from 'node:test';

const base = process.env.JIRA_BASE_URL ?? 'http://127.0.0.1:8081';
const valid = 'Bearer mock-jira-token';
const search = (project, start) => '/rest/api/2/search?' + new URLSearchParams({
  jql: `project = ${project} ORDER BY key ASC`,
  ...(start === undefined ? {} : { startAt: String(start), maxResults: '2' }),
});
async function request(path, auth = valid, method = 'GET') {
  const response = await fetch(base + path, {
    method, headers: auth === null ? {} : { Authorization: auth },
    signal: AbortSignal.timeout(5000),
  });
  assert.match(response.headers.get('content-type'), /application\/json/);
  if (method === 'HEAD') {
    // Jetty adds a second close token for bodyless HEAD responses.
    assert.ok(response.headers.get('connection').split(',').every(value => value.trim() === 'close'));
  } else {
    assert.equal(response.headers.get('connection'), 'close');
  }
  return { status: response.status, body: method === 'HEAD' ? null : await response.json() };
}

test('B-J/J-L: project → all pages → details, complete coherent stateless synthetic data', async () => {
  const projects = await request('/rest/api/2/project');
  assert.equal(projects.status, 200);
  assert.deepEqual(projects.body.map(p => [p.key, p.id]), [['MOCK', '10000'], ['EMPTY', '11000']]);
  const user = await request('/rest/api/2/myself');
  assert.equal(user.status, 200);
  for (const project of projects.body) {
    const expectedKeys = project.key === 'MOCK' ? Array.from({length:8}, (_,i)=>`MOCK-${i+1}`) : [];
    const all = await request(search(project.key));
    assert.equal(all.status, 200);
    assert.deepEqual(Object.keys(all.body).sort(), ['issues', 'maxResults', 'startAt', 'total']);
    assert.equal(all.body.startAt, 0);
    assert.equal(all.body.maxResults, 50);
    assert.equal(all.body.total, expectedKeys.length);
    assert.deepEqual(all.body.issues.map(i => i.key), expectedKeys);
    const collected = [];
    for (const start of [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]) {
      const path = search(project.key, start);
      const page = await request(path);
      assert.equal(page.status, 200);
      assert.deepEqual(page.body, {
        startAt: start, maxResults: 2, total: expectedKeys.length,
        issues: all.body.issues.slice(start, start + 2),
      });
      collected.push(...page.body.issues);
      assert.deepEqual(await request(path), page);
    }
    assert.deepEqual(collected, all.body.issues);
    assert.equal(new Set(collected.map(i => i.id)).size, expectedKeys.length);
    assert.equal(new Set(collected.map(i => i.key)).size, expectedKeys.length);
    for (const [index, issue] of collected.entries()) {
      const detail = await request('/rest/api/2/issue/' + issue.key);
      assert.equal(detail.status, 200);
      assert.deepEqual(detail.body, issue);
      assert.equal(issue.id, String(10001 + index));
      assert.equal(issue.self, base + '/rest/api/2/issue/' + issue.id);
      assert.deepEqual(Object.keys(issue).sort(), ['fields', 'id', 'key', 'self']);
      assert.deepEqual(Object.keys(issue.fields).sort(), ['assignee', 'created', 'description', 'issuetype', 'priority', 'project', 'reporter', 'resolution', 'resolutiondate', 'status', 'summary', 'updated']);
      assert.deepEqual(issue.fields.project, project);
      const assigned=['mock-user-a','mock-user-a','mock-user-b','mock-user-b','mock-user-b','mock-user-a',null,'mock-user-a'];
      const reported=['mock-user-b','mock-user-a','mock-user-a','mock-user-a','mock-user-c','mock-user-c','mock-user-a','mock-user-b'];
      const statuses=['Open','Done','In Progress','Done','Open','Closed','Open','In Progress'];
      assert.equal(issue.fields.assignee?.name??null,assigned[index]);
      assert.equal(issue.fields.reporter.name,reported[index]);
      if(assigned[index]==='mock-user-a') assert.deepEqual(issue.fields.assignee,user.body);
      if(reported[index]==='mock-user-a') assert.deepEqual(issue.fields.reporter,user.body);
      assert.equal(issue.fields.status.name,statuses[index]);
      assert.equal(issue.fields.issuetype.name, 'Task');
      assert.equal(typeof issue.fields.summary, 'string');
      assert.equal(typeof issue.fields.description, 'string');
    }
  }
});

test('J-L: decoded query values, %20/+ spaces and all parameter orders', async () => {
  const jql = encodeURIComponent('project = MOCK ORDER BY key ASC');
  const parts = ['jql=' + jql, 'startAt=2', 'maxResults=2'];
  const permutations = a => a.length === 1 ? [a] : a.flatMap((v, i) =>
    permutations(a.filter((_, j) => i !== j)).map(rest => [v, ...rest]));
  const expected = await request(search('MOCK', 2));
  assert.equal(expected.status, 200);
  for (const params of permutations(parts)) {
    assert.deepEqual(await request('/rest/api/2/search?' + params.join('&')), expected);
  }
  assert.deepEqual(await request('/rest/api/2/search?jql=project%20%3d%20%4dOCK%20ORDER%20BY%20key%20ASC&maxResults=%32&startAt=%32'), expected);
  assert.deepEqual(await request('/rest/api/2/search?%6Aql=' + jql + '&%73tartAt=2&max%52esults=2'), expected);
});

test('J-L: every supported search shape requires exact PAT, no protected data on failure', async () => {
  for (const project of ['MOCK', 'EMPTY']) for (const start of [undefined, 0, 2, 4]) {
    const path = search(project, start);
    assert.equal((await request(path)).status, 200);
    for (const auth of [null, 'Bearer wrong', 'Bearer MOCK-JIRA-TOKEN', 'bearer mock-jira-token', 'Basic abc', 'Bearer mock-confluence-token']) {
      assert.deepEqual(await request(path, auth), {
        status: 401, body: { 'status-code': 401, message: 'Authentication required' },
      });
    }
  }
});

test('J-L: unsupported query/method/path shapes precede authentication', async () => {
  const jql = 'jql=' + encodeURIComponent('project = MOCK ORDER BY key ASC');
  const invalidQueries = [
    '', 'jql=', 'JQL=' + encodeURIComponent('project = MOCK ORDER BY key ASC'),
    'jql=project%3DMOCK', 'jql=project+%3D+OTHER+ORDER+BY+key+ASC',
    'jql=project+%3D+MOCK+ORDER+BY+key+DESC',
    'jql=project++%3D+MOCK+ORDER+BY+key+ASC',
    jql + '&startAt=0', jql + '&maxResults=2', jql + '&startAt=0&maxResults=50',
    jql + '&startAt=1&maxResults=2', jql + '&startAt=00&maxResults=2',
    jql + '&startAt=-2&maxResults=2', jql + '&startAt=2.0&maxResults=2',
    jql + '&startAt=&maxResults=2', jql + '&startAt=0&maxResults=02',
    jql + '&startAt=0&maxResults=', jql + '&fields=summary', jql + '&expand=names',
    jql + '&unknown=1', jql + '&' + jql, jql + '&jql=wrong',
    jql + '&startAt=0&maxResults=2&startAt=0',
    jql + '&startAt=0&maxResults=2&maxResults=2',
    jql + '&%6Aql=wrong', jql + '&startAt=0&maxResults=2&%73tartAt=0',
    jql + '&startAt=0&maxResults=2&extra=1',
    jql + '&StartAt=0&maxResults=2',
  ];
  const paths = invalidQueries.map(q => ['/rest/api/2/search' + (q ? '?' + q : ''), 'GET']);
  for (const path of ['/rest/api/2/search/', '/rest/api/2/Search', '/rest/api/2/search/extra']) paths.push([path + '?' + jql, 'GET']);
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']) paths.push([search('MOCK', 0), method]);
  for (const [path, method] of paths) for (const auth of [valid, null, 'Bearer wrong']) {
    const result = await request(path, auth, method);
    assert.equal(result.status, 404, method + ' ' + path);
    if (method !== 'HEAD') assert.deepEqual(result.body, {
      mockError: 'UNSUPPORTED_REQUEST', message: 'This request is outside the supported mock contract.',
    });
  }
});
