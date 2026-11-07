import assert from 'node:assert/strict';
import { test } from 'node:test';
import { logAiFailure } from './ai-diagnostics.ts';

function capture(error: unknown) {
  const entries: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { entries.push(args); };
  try {
    logAiFailure('prescription', 'inference', error);
  } finally {
    console.error = original;
  }
  return entries;
}

test('upstream health payloads and credentials never enter diagnostics', () => {
  const error = Object.assign(new Error('patient-private token-private'), {
    status: 503,
    body: { image: 'private-image', medications: 'private-drug' },
  });
  assert.deepEqual(capture(error), [[
    'AI analysis failed',
    { feature: 'prescription', stage: 'inference', timeout: false, status: 503 },
  ]]);
});

test('timeouts remain distinguishable without logging the exception', () => {
  const error = Object.assign(new Error('private'), { name: 'TimeoutError' });
  assert.deepEqual(capture(error), [[
    'AI analysis failed',
    { feature: 'prescription', stage: 'inference', timeout: true, status: undefined },
  ]]);
});

test('untrusted status strings and non-HTTP numbers are omitted', () => {
  for (const status of ['private-patient', 7003, 200, NaN]) {
    assert.deepEqual(capture({ status }), [[
      'AI analysis failed',
      { feature: 'prescription', stage: 'inference', timeout: false, status: undefined },
    ]]);
  }
});
