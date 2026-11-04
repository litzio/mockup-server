import assert from 'node:assert/strict';
import test from 'node:test';
import { withContext } from './prepare-context.mjs';

test('context preparation preserves scenario arrays, auth and query constraints', () => {
  const mapping = { mappings: [{ priority: 2, scenarioName: 'product-read', requiredScenarioState: 'delay',
    request: { urlPattern: '/rest/api/content/[1-9][0-9]*', headers: { Authorization: { equalTo: 'Bearer mock-confluence-token' } } },
    response: { fixedDelayMilliseconds: 1500, jsonBody: { _links: { base: '{{request.baseUrl}}', context: '',
      self: '{{request.baseUrl}}{{{request.url}}}', next: '/rest/api/space/MOCK/content/page?start=2&limit=2',
      page: '{{request.baseUrl}}/rest/api/content/20001' } } } }] };
  const actual = withContext(mapping, '/confluence');
  assert.deepEqual(withContext(mapping, ''), mapping);
  const item = actual.mappings[0];
  assert.equal(item.request.urlPattern, '/confluence/rest/api/content/[1-9][0-9]*');
  assert.deepEqual(item.request.headers, mapping.mappings[0].request.headers);
  assert.equal(item.requiredScenarioState, 'delay');
  assert.equal(item.response.fixedDelayMilliseconds, 1500);
  assert.deepEqual(item.response.jsonBody._links, { base: '{{request.baseUrl}}', context: '/confluence',
    self: '{{request.baseUrl}}{{{request.url}}}', next: '/confluence/rest/api/space/MOCK/content/page?start=2&limit=2',
    page: '{{request.baseUrl}}/confluence/rest/api/content/20001' });
  assert.equal(mapping.mappings[0].request.urlPattern, '/rest/api/content/[1-9][0-9]*');
  assert.equal(withContext('pages/{{request.pathSegments.[3]}}.json', '/confluence'), 'pages/{{request.pathSegments.[4]}}.json');
});
