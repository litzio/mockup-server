const bases = [process.env.JIRA_BASE_URL ?? 'http://127.0.0.1:8081', process.env.CONFLUENCE_BASE_URL ?? 'http://127.0.0.1:8082'];
await Promise.all(bases.map(async base => {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(base + '/__admin/mappings', { signal: AbortSignal.timeout(2000) });
      if (response.ok && (await response.json()).mappings.length >= 3) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error('Service not ready: ' + base);
}));
console.log('Both services ready');
