import assert from 'node:assert/strict';
import { getPlatformProxy } from 'wrangler';
import { parseAiResponse } from '../apps/api/src/ai-response.ts';

// Use Wrangler's login and remote binding rather than copying an OAuth token
// into an environment file. The authenticated first request creates `default`
// if needed; no separate AI Gateway management token is required.
const proxy = await getPlatformProxy({
  configPath: 'apps/api/wrangler.jsonc',
  remoteBindings: true,
  persist: false,
});

try {
  const gatewayId = proxy.env.AI_GATEWAY_ID;
  assert.ok(gatewayId, 'AI_GATEWAY_ID is missing from the API Wrangler config');
  const model = '@cf/meta/llama-4-scout-17b-16e-instruct';
  const result = await proxy.env.AI.run(
    model,
    {
      messages: [{ role: 'user', content: 'Return only this JSON object: {"ok":true}' }],
      temperature: 0,
      max_tokens: 64,
    },
    {
      gateway: {
        id: gatewayId,
        skipCache: true,
        collectLog: false,
        requestTimeoutMs: 30_000,
      },
      // AbortSignal cannot cross getPlatformProxy's RPC boundary. The gateway
      // timeout above bounds inference without serializing a host object.
    },
  );
  assert.equal(parseAiResponse(result).ok, true, 'Unexpected inference result');
  console.log(`PASS Workers AI → AI Gateway (${gatewayId}) → ${model}`);
} catch {
  // Do not print upstream payloads or credentials, even in setup diagnostics.
  console.error('AI Gateway verification failed. Check `npx wrangler whoami`, the AI binding, and Workers AI account access.');
  process.exitCode = 1;
} finally {
  await proxy.dispose();
}
