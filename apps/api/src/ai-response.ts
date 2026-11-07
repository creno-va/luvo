function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// The remote binding sometimes decodes JSON into an object despite declaring
// `response` as string. Gateway responses can also use a completion envelope.
export function parseAiResponse(result: unknown): unknown {
  if (!isObject(result)) throw new Error('Missing AI response');
  if (isObject(result.response)) return result.response;
  let text: unknown = result.response;
  if (typeof text !== 'string') {
    const choice = Array.isArray(result.choices) ? result.choices[0] : undefined;
    text = isObject(choice) && isObject(choice.message)
      ? choice.message.content : undefined;
  }
  if (typeof text !== 'string') throw new Error('Missing AI response');
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  if (!json) throw new Error('Missing AI JSON');
  return JSON.parse(json) as unknown;
}
