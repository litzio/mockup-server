import assert from 'node:assert/strict';

// The same client code is used with every Base URL/PAT pair.
export async function checkContext(product, base, pat) {
  const { origin, pathname } = new URL(base);
  const context = pathname === '/' ? '' : pathname;
  const get = async (path, token = pat, expected = 200) => {
    const url = /^http:/.test(path) ? path : base + path;
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(6000) });
    assert.equal(response.status, expected, url);
    assert.equal(response.headers.get('connection'), 'close');
    assert.match(response.headers.get('content-type'), /application\/json/);
    return response.json();
  };
  const validateLinks = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (key === 'self' && typeof item === 'string') assert.ok(item.startsWith(base + '/rest/'), item);
      if (key === 'base') assert.equal(item, origin);
      if (key === 'context') assert.equal(item, context);
      if (key === 'next' || key === 'prev') assert.ok(item.startsWith(context + '/rest/'), item);
      validateLinks(item);
    }
  };
  const endpoint = product === 'jira' ? '/rest/api/2/myself' : '/rest/api/user/current';
  validateLinks(await get(endpoint));
  await get(endpoint, 'wrong', 401);
  if (context) {
    const fallback = await get(origin + endpoint, pat, 404);
    assert.equal(fallback.mockError, 'UNSUPPORTED_REQUEST');
  }
  if (product === 'jira') {
    validateLinks(await get('/rest/api/2/project'));
    const issues = await get('/rest/api/2/search?jql=' + encodeURIComponent('project = MOCK ORDER BY key ASC'));
    assert.equal(issues.total, 18);
    validateLinks(issues);
    for (const issue of issues.issues) {
      assert.deepEqual(await get(issue.self), issue);
      assert.deepEqual(await get('/rest/api/2/issue/' + issue.key), issue);
    }
    await get('/rest/api/2/issue/99999', pat, 404);
    assert.equal((await get('/rest/api/2/issue/010001', pat, 404)).mockError, 'UNSUPPORTED_REQUEST');
  } else {
    validateLinks(await get('/rest/api/space'));
    let page = await get('/rest/api/space/MOCK/content/page?start=0&limit=2');
    const ids = [];
    for (;;) {
      validateLinks(page);
      assert.deepEqual(await get(page._links.self), page);
      for (const item of page.results) {
        ids.push(item.id);
        const detail = await get(item._links.self);
        validateLinks(detail);
        assert.equal(detail.id, item.id);
        assert.equal((await get(item._links.self + '?expand=body.storage')).body.storage.representation, 'storage');
      }
      if (!page._links.next) break;
      const previous = page;
      page = await get(origin + page._links.next);
      assert.deepEqual(await get(origin + page._links.prev), previous);
    }
    assert.deepEqual(ids, ['20001', '20002', '20003']);
  }
  console.log('U: PASS ' + product + ' ' + base);
}

for (const product of ['jira', 'confluence']) {
  const prefix = product.toUpperCase();
  await checkContext(product, process.env[prefix + '_BASE_URL'] ?? 'http://127.0.0.1:' + (product === 'jira' ? 8081 : 8082),
    process.env[prefix + '_PAT'] ?? 'mock-' + product + '-token');
}
