import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseAiResponse } from './ai-response.ts';

test('accepts the decoded response object observed through the remote AI binding', () => {
  const payload = { medications: [], warnings: [] };
  assert.deepEqual(parseAiResponse({ response: payload }), payload);
});

test('preserves string and fenced JSON responses', () => {
  for (const response of ['{"watch":[]}', '```json\n{"watch":[]}\n```']) {
    assert.deepEqual(parseAiResponse({ response }), { watch: [] });
  }
});

test('accepts a Gateway chat-completion envelope', () => {
  assert.deepEqual(parseAiResponse({
    choices: [{ message: { content: '{"watch":[]}' } }],
  }), { watch: [] });
});

test('rejects missing and malformed results', () => {
  for (const result of [null, {}, { response: [] }, { response: 'no JSON' }, { response: '{broken}' }]) {
    assert.throws(() => parseAiResponse(result));
  }
});
