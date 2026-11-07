import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeDocumentExtraction as normalize,
  decodeDocumentResponse,
  documentDate,
  documentTime,
  documentResponseSchema,
} from "./document-extraction.ts";

test("normal birth-exam findings remain record content rather than historical diseases", () => {
  const result = normalize(
    {
      animal: { name: "모의 강아지", age: "출생 당일" },
      date: "2020-11-07",
      diagnosis: "신생자 검진상 임상적 특이 소견 없음",
      summary: "출생 검진 양호 · 특이 소견 없음.",
      conditions: [
        { name: "", status: "history", note: "" },
        {
          name: "신생자 검진상 임상적 특이 소견 없음",
          status: "history",
          note: "",
        },
        { name: "정상 검진", status: "diagnosed", note: "" },
      ],
    },
    "diagnosis",
  );
  assert.deepEqual(result.conditions, []);
  assert.match(result.diagnosis, /특이 소견 없음/);
  assert.equal(result.summary, "출생 검진 양호 · 특이 소견 없음.");
  assert.equal(result.quality, "filled");
});

test("normal findings survive an omitted model summary and a real neonatal illness is retained", () => {
  const record = normalize(
    {
      diagnosis: "",
      conditions: [
        { name: "건강 검진", status: "history", note: "검진 시 활력 양호" },
      ],
    },
    "diagnosis",
  );
  assert.deepEqual(record.conditions, []);
  assert.match(record.summary, /활력 양호/);
  assert.equal(record.quality, "filled");
  const illness = normalize(
    {
      diagnosis: "신생아 패혈증 의심",
      conditions: [
        {
          name: "신생아 패혈증",
          status: "suspected",
          statusEvidence: "패혈증 의심",
          note: "",
        },
      ],
    },
    "diagnosis",
  );
  assert.equal(illness.conditions[0].name, "신생아 패혈증");
  assert.equal(illness.conditions[0].status, "suspected");
});

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
test("diagnosis output preserves core fields and omits removed clinical details", () => {
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
  for (const key of [
    "time",
    "clinic",
    "issuedDate",
    "onsetDate",
    "prognosis",
    "otherFindings",
  ])
    assert.ok(!Object.hasOwn(result, key));
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
          durationEvidence: "처방일수 7일",
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
  assert.equal(patient.medications.length, 0);
  assert.ok(!Object.hasOwn(patient.animal, "birthDate"));
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
  assert.ok(result.warnings.some((w) => w.includes("처방일수")));
});

test("removed fields cannot be requested by the model schema or returned by normalization", () => {
  const properties = documentResponseSchema.properties;
  for (const key of [
    "clinic",
    "time",
    "issuedDate",
    "onsetDate",
    "prognosis",
    "otherFindings",
  ])
    assert.ok(!Object.hasOwn(properties, key));
  const patient = properties.animal.properties;
  for (const key of ["species", "birthDate", "birthDateEvidence"])
    assert.ok(!Object.hasOwn(patient, key));
  const medication = properties.medications.items.properties;
  for (const key of [
    "action",
    "actionEvidence",
    "startDate",
    "endDate",
    "instructions",
  ])
    assert.ok(!Object.hasOwn(medication, key));
  const result = normalize(
    {
      animal: { name: "보리", species: "개", birthDate: "2020-01-01" },
      clinic: "병원",
      time: "09:00",
      medications: [
        {
          name: "약",
          dose: "1정",
          times: ["오후 8시 00분"],
          startDate: "2026-11-01",
          endDate: "2026-11-02",
          instructions: "식후",
          action: "prescribe",
        },
      ],
    },
    "prescription",
  );
  assert.deepEqual(result.medications[0].times, ["20:00"]);
  for (const key of ["action", "startDate", "endDate", "instructions"])
    assert.ok(!Object.hasOwn(result.medications[0], key));
});

test("dates alone cannot create a course length and excluded-field requests are dropped", () => {
  const result = normalize(
    {
      animal: { name: "두부" },
      date: "2026-11-07",
      medications: [
        {
          name: "약",
          dose: "1정",
          times: ["20:00"],
          durationDays: "2",
          durationEvidence: "2026-11-07 ~ 2026-11-09",
        },
      ],
      warnings: ["복용 중단일을 확인해 주세요.", "생년월일을 확인해 주세요."],
    },
    "prescription",
  );
  assert.equal(result.medications[0].durationDays, "");
  assert.ok(!result.warnings.some((w) => /중단일|생년월일/.test(w)));
});

test("discarded disease labels do not become a finding in an otherwise blank form", () => {
  const result = normalize(
    {
      quality: "blank",
      conditions: [
        { name: "과거 병력", status: "history", note: "" },
        { name: "병력", status: "history", note: "" },
      ],
    },
    "diagnosis",
  );
  assert.deepEqual(result.conditions, []);
  assert.equal(result.summary, "");
  assert.equal(result.quality, "blank");
});
