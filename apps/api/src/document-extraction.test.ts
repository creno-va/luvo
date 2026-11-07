import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeDocumentExtraction as normalize,
  decodeDocumentResponse,
  documentDate,
  documentTime,
} from "./document-extraction.ts";

test("blank standard-form labels and unselected sex choices are never patient or drug values", () => {
  const result = normalize(
    {
      quality: "blank",
      animal: {
        name: "동물의 이름",
        species: "동물의 종류",
        breed: "품종",
        sex: "암·수",
        age: "세",
        weight: "kg",
        birthDate: null,
      },
      date: "년 월 일",
      diagnosis: "병명",
      clinic: "동물병원 명칭",
      medications: [{ name: "성분명", dose: "1회 투약량" }],
      conditions: [{ name: "병명" }],
    },
    "prescription",
  );
  assert.equal(result.quality, "blank");
  assert.equal(result.animal.name, "");
  assert.equal(result.animal.sex, "");
  assert.equal(result.date, "");
  assert.equal(result.medications.length, 0);
  assert.equal(result.conditions.length, 0);
});
test("diagnosis fields preserve clinical date, onset, prognosis and notes separately from issuance", () => {
  const result = normalize(
    {
      documentKind: "diagnosis",
      animal: {
        name: "두부",
        species: "개",
        breed: "말티즈",
        sex: "암컷",
        age: "7세",
        weight: "4.2 kg",
      },
      date: "2026년 11월 7일",
      time: "오전 9시 30분",
      issuedDate: "2026.11.08",
      onsetDate: "2026/11/01",
      diagnosis: "외이염",
      prognosis: "추적 관찰 예정",
      otherFindings: "좌측 귀 소견",
      medications: [],
    },
    "prescription",
  );
  assert.equal(result.documentKind, "diagnosis");
  assert.equal(result.date, "2026-11-07");
  assert.equal(result.time, "09:30");
  assert.equal(result.issuedDate, "2026-11-08");
  assert.equal(result.onsetDate, "2026-11-01");
  assert.equal(result.prognosis, "추적 관찰 예정");
  assert.equal(result.animal.breed, "말티즈");
  assert.equal(result.animal.weight, "4.2 kg");
  assert.equal(result.dateSource, "clinical");
});
test("an issuance-only document uses its written date with an explicit confirmation warning", () => {
  const result = normalize(
    {
      animal: { name: "두부" },
      date: null,
      issuedDate: "2026. 11. 7.",
      medications: [],
    },
    "prescription",
  );
  assert.equal(result.date, "2026-11-07");
  assert.equal(result.dateSource, "issued");
  assert.ok(result.warnings.some((w) => w.includes("발급일")));
});
test("ingredient, product, per-dose quantity, duration and sale quantity do not overwrite one another", () => {
  const result = normalize(
    {
      animal: { name: "두부" },
      date: "2026-11-07",
      medications: [
        {
          name: "",
          ingredient: "가상성분 A",
          productName: "가상제품 A",
          dose: "0.5정",
          durationDays: "7일",
          totalQuantity: "14정",
          frequency: "1일 2회",
          instructions: "경구",
          times: [],
          startDate: "",
          endDate: "",
        },
      ],
    },
    "prescription",
  );
  const med = result.medications[0];
  assert.equal(med.name, "가상제품 A");
  assert.equal(med.dose, "0.5정");
  assert.equal(med.totalQuantity, "14정");
  assert.equal(med.durationDays, "7일");
  assert.equal(med.frequency, "1일 2회");
  assert.deepEqual(med.times, []);
  assert.equal(med.startDate, "");
  assert.equal(med.endDate, "");
});
test("a species in the type cell is kept apart from a missing breed", () => {
  const result = normalize(
    {
      animal: { name: "두부", breed: "개" },
      medications: null,
      warnings: null,
    },
    "diagnosis",
  );
  assert.equal(result.animal.species, "개");
  assert.equal(result.animal.breed, "");
  assert.deepEqual(result.medications, []);
});
test("partial tables retain visible rows without manufacturing missing data", () => {
  const result = normalize(
    {
      quality: "partial",
      animal: { name: "두부" },
      medications: [{ name: "가상약 A", dose: null, times: null }],
      conditions: null,
    },
    "prescription",
  );
  assert.equal(result.quality, "partial");
  assert.equal(result.medications.length, 1);
  assert.equal(result.medications[0].dose, "");
  assert.deepEqual(result.medications[0].times, []);
  assert.ok(result.warnings.some((w) => w.includes("잘리거나")));
});
test("invalid dates and unknown clock times remain blank", () => {
  for (const date of [null, "", "2026-02-30", "11월 7일", "년 월 일"])
    assert.equal(documentDate(date), "");
  assert.equal(documentDate("2024.2.29"), "2024-02-29");
  assert.equal(documentTime("오후 12시 05분"), "12:05");
  assert.equal(documentTime("오전 12시 05분"), "00:05");
  assert.equal(documentTime("25:10"), "");
  assert.equal(documentTime("1일 2회"), "");
});
test("decoded JSON, text, markdown envelopes and Gateway completions are accepted", () => {
  const payload = { animal: { name: "두부" }, medications: [] };
  for (const response of [
    { response: payload },
    { response: JSON.stringify(payload) },
    { response: "```json\n" + JSON.stringify(payload) + "\n```" },
    { choices: [{ message: { content: JSON.stringify(payload) } }] },
  ])
    assert.deepEqual(decodeDocumentResponse(response), payload);
  for (const response of [null, {}, { response: "not JSON" }, { response: [] }])
    assert.throws(() => decodeDocumentResponse(response));
  assert.throws(() => normalize({}, "prescription"));
});

test("owner birth dates and unsupported stop/suspected classifications are not adopted", () => {
  const result = normalize(
    {
      animal: {
        name: "보리",
        birthDate: "1990-04-03",
        birthDateEvidence: "소유자 생년월일 1990-04-03",
      },
      date: "2026-11-07",
      issuedDate: "2026-11-07",
      dateSource: "clinical",
      dateEvidence: "발급 연월일 2026-11-07",
      medications: [
        { name: "가상약", dose: "0.5정", action: "stop", actionEvidence: "" },
      ],
      conditions: [
        {
          name: "외이염",
          status: "suspected",
          statusEvidence: "",
          note: "추적 관찰 필요",
        },
      ],
    },
    "prescription",
  );
  assert.equal(result.animal.birthDate, "");
  assert.equal(result.medications[0].action, "prescribe");
  assert.equal(result.conditions[0].status, "diagnosed");
  assert.equal(result.dateSource, "issued");
  const patient = normalize(
    {
      animal: {
        name: "보리",
        birthDate: "2019-04-03",
        birthDateEvidence: "동물 생년월일 2019-04-03",
      },
      medications: [
        { name: "가상약", action: "stop", actionEvidence: "가상약 투약 중단" },
      ],
      conditions: [
        { name: "외이염", status: "suspected", statusEvidence: "외이염 의심" },
      ],
    },
    "diagnosis",
  );
  assert.equal(patient.animal.birthDate, "2019-04-03");
  assert.equal(patient.medications[0].action, "stop");
  assert.equal(patient.conditions[0].status, "suspected");
});

test("duration fields reject code fragments or inferred date arithmetic", () => {
  const result = normalize(
    {
      animal: { name: "보리" },
      medications: [
        {
          name: "가상약",
          durationDays: "{(2026-11-09).toLocaleDateString() - (20",
          action: "stop",
          actionEvidence: "중단 지시 없음",
        },
      ],
    },
    "prescription",
  );
  assert.equal(result.medications[0].durationDays, "");
  assert.equal(result.medications[0].action, "prescribe");
  assert.ok(result.warnings.some((w) => w.includes("처방일수")));
});
