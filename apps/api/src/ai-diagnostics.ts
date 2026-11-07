type AiStage = 'inference' | 'decode' | 'validation' | 'grounding';

export function logAiFailure(
  feature: 'prescription' | 'briefing',
  stage: AiStage,
  error: unknown,
) {
  // Error messages, stacks and validation issues may contain clinical content.
  // Log only fixed categories and numeric status codes, never the error itself.
  const timeout = error instanceof Error &&
    (error.name === 'TimeoutError' || error.name === 'AbortError');
  const status = error !== null && typeof error === 'object' &&
    'status' in error && typeof error.status === 'number' &&
    Number.isInteger(error.status) && error.status >= 400 && error.status <= 599
      ? error.status : undefined;
  console.error('AI analysis failed', { feature, stage, timeout, status });
}
