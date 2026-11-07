import { test } from "node:test";
import assert from "node:assert/strict";
import { briefings } from "./briefings.ts";

function request(
  diagnosis = "피부사상균증",
  output: unknown = { watch: [], questions: [], unknowns: [] },
  recordOverride: Partial<{
    summary: string;
    conditions: { name: string; status: string; note: string }[];
  }> = {},
) {
  const context = {
    pet: {
      name: "두부",
      breed: "",
      sex: "",
      age: "",
      birthDate: "",
      profileAsOf: "",
    },
    asOf: "2026-11-07",
    records: [
      {
        id: "record-2021",
        date: "2021-11-07",
        diagnosis,
        summary: "",
        conditions: [{ name: diagnosis, status: "diagnosed", note: "" }],
        ...recordOverride,
        medications: [],
      },
    ],
    currentMedications: [],
    doseRecords: [],
    uncheckedMeaning: "미체크는 미확인",
  };
  return briefings.request(
    "http://localhost/analyze",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contextHash: "a".repeat(64), context }),
    },
    {
      BRIEF_LIMITER: { limit: async () => ({ success: true }) },
      AI_GATEWAY_ID: "test",
      AI: {
        run: async (
          _model: string,
          input: { messages: { content: string }[] },
        ) => {
          const supplied = JSON.parse(input.messages[1].content);
          assert.ok(
            supplied.clinicalGuides.some(
              (g: { id: string }) => g.id === "merck-dermatophytosis",
            ),
          );
          return { response: JSON.stringify(output) };
        },
      },
    },
  );
}

test("an empty model response still returns skin follow-up content, source record and working guide metadata", async () => {
  const response = await request();
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.watch.length, 1);
  assert.equal(data.questions.length, 3);
  assert.deepEqual(data.watch[0].sourceIds, ["record-2021"]);
  assert.equal(data.references[0].id, data.watch[0].referenceIds[0]);
  assert.match(data.references[0].url, /^https:\/\/www.merckvetmanual.com\//);
  assert.match(data.current[0].text, /피부사상균증/);
  assert.equal(data.contextHash, "a".repeat(64));
});

test("an unrelated diagnosis gets a visit question without skin guidance or an unsupported reference", async () => {
  const response = await request("외이염");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.deepEqual(data.watch, []);
  assert.deepEqual(data.references, []);
  assert.match(data.questions[0], /외이염/);
  assert.ok(!JSON.stringify(data).includes("피부사상균증"));
});

test("the API returns a birth-exam overview in place of an empty historical illness", async () => {
  const response = await request(
    "신생자 검진상 임상적 특이 소견 없음",
    undefined,
    {
      summary: "출생 당일 검진. 검진 시 활력 양호.",
      conditions: [{ name: "", status: "history", note: "" }],
    },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.match(data.current[0].text, /출생 검진 양호 · 특이 소견 없음/);
  assert.deepEqual(data.current[0].sourceIds, ["record-2021"]);
  assert.ok(!JSON.stringify(data).includes("과거 병력"));
  assert.deepEqual(data.watch, []);
});

test("one invented model citation cannot suppress verified record facts and skin follow-up", async () => {
  const response = await request("피부사상균증", {
    watch: [
      {
        title: "근거 없는 항목",
        possibility: "모델이 만든 근거 없는 가능성이에요.",
        prepare: "원문에 없는 준비 내용은 표시하지 않아요.",
        sourceIds: ["invented-record"],
        referenceIds: ["invented-guide"],
      },
    ],
    questions: [],
    unknowns: [],
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.watch.length, 1);
  assert.deepEqual(data.watch[0].sourceIds, ["record-2021"]);
  assert.equal(data.references[0].id, "merck-dermatophytosis");
  assert.ok(!JSON.stringify(data).includes("invented-"));
  assert.match(data.unknowns.join(" "), /제외/);
});
