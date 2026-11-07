import assert from 'node:assert/strict';
import { setTimeout } from 'node:timers/promises';

const origin = new URL(process.argv[2] ?? 'https://luvo.baro.site');

const checks = [
  {
    path: '/',
    verify: async (response) => {
      assert.match(response.headers.get('content-type') ?? '', /text\/html/);
      assert.match(await response.text(), /<title>Luvo<\/title>/);
    },
  },
  {
    path: '/api/health',
    verify: async (response) => {
      const body = await response.json();
      assert.equal(body.status, 'ok');
      assert.equal(body.service, 'luvo-api');
    },
  },
  {
    path: '/api/health/db',
    verify: async (response) => {
      const body = await response.json();
      assert.equal(body.status, 'ok');
      assert.equal(body.database, 'd1');
      assert.equal(response.headers.get('cache-control'), 'no-store');
    },
  },
];

for (const { path, verify } of checks) {
  const url = new URL(path, origin);

  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(10_000),
      });
      assert.equal(response.status, 200, `${url}: expected HTTP 200`);
      await verify(response);
      console.log(`PASS ${url}`);
      break;
    } catch (error) {
      if (attempt === 5) throw error;
      console.warn(`Retry ${attempt}/5: ${url} (${error.message})`);
      await setTimeout(2_000);
    }
  }
}
