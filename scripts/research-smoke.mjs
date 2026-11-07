import assert from "node:assert/strict";

const origin = new URL(process.argv[2] || "https://luvo.baro.site");
const request = async (name, refresh = false) => {
  const response = await fetch(new URL("/api/medications/research", origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin.origin,
      ...(refresh ? { "Cache-Control": "no-cache" } : {}),
    },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(75000),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    200,
    `Medication research returned HTTP ${response.status}`,
  );
  return result;
};
// Only public test medication labels are sent; no patient history or dose data.
let first;
for (const name of ["피모벤단", "가바펜틴"]) {
  const result = await request(name, true);
  if (name === "피모벤단") first = result;
  assert.equal(
    result.matched,
    true,
    `${name}: expected an identified medication, got ${result.status}`,
  );
  assert.ok(
    result.overview.length > 0 && result.sources.length > 0,
    `${name}: expected cited Korean information`,
  );
  assert.ok(
    result.overview.every(
      (fact) =>
        /[가-힣]/.test(fact.text) &&
        fact.sourceIds.every((id) =>
          result.sources.some((source) => source.id === id),
        ),
    ),
  );
  console.log(
    `PASS ${name}: cited Korean summary (${result.sources.length} sources)`,
  );
}
assert.deepEqual(
  await request("피모벤단"),
  first,
  "A repeat lookup should reuse the successful cached result",
);
console.log("PASS successful search cache");
const ambiguous = await request("심장약");
assert.equal(ambiguous.matched, false);
for (const section of ["overview", "uses", "sideEffects", "cautions"])
  assert.deepEqual(ambiguous[section], []);
console.log("PASS ambiguous category does not invent a medication");
