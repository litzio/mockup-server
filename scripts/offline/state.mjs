import assert from 'node:assert/strict';

const action = process.argv[2];
assert.ok(['started', 'dirty'].includes(action));
for (const [product, fallback] of [['jira', 'http://127.0.0.1:8081'], ['confluence', 'http://127.0.0.1:8082']]) {
  const base = process.env[product.toUpperCase() + '_BASE_URL'] ?? fallback;
  const origin = new URL(base).origin;
  if (action === 'dirty') {
    const changed = await fetch(origin + '/__admin/scenarios/product-read/state', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'forbidden' }), signal: AbortSignal.timeout(5000),
    });
    assert.equal(changed.status, 200);
  }
  const response = await fetch(origin + '/__admin/scenarios', { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  const scenarios = (await response.json()).scenarios;
  assert.equal(scenarios.find(scenario => scenario.name === 'product-read')?.state, action === 'dirty' ? 'forbidden' : 'Started');
  const endpoint = product === 'jira' ? '/rest/api/2/myself' : '/rest/api/user/current';
  const read = await fetch(base + endpoint, {
    headers: { Authorization: `Bearer mock-${product}-token` }, signal: AbortSignal.timeout(5000),
  });
  assert.equal(read.status, action === 'dirty' ? 403 : 200);
  console.log(`${product}: ${action} scenario and HTTP confirmed`);
}
