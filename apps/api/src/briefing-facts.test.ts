import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groundedFacts,
  supportedWatch,
  groundedPreparation,
  completeFollowUp,
  type BriefContext,
} from "./briefing-facts.ts";
const context: BriefContext = {
  pet: { name: "두부" },
  records: [
    {
      id: "r1",
      date: "2026-11-07",
      diagnosis: "만성 신장질환",
      conditions: [
        { name: "만성 신장질환", status: "diagnosed", note: "" },
        { name: "승모판 질환", status: "history", note: "" },
      ],
    },
  ],
  currentMedications: [{ name: "가상약" }],
  doseRecords: [],
};
test("a past illness is not rewritten as recovery or resolved disease", () => {
  const facts = groundedFacts(context);
  assert.match(facts.summary, /과거 병력/);
  assert.ok(!facts.summary.includes("호전"));
  assert.equal(facts.current[1].sourceIds[0], "r1");
});
test("newer explicit status does not erase older unrelated conditions", () => {
  const facts = groundedFacts({
    ...context,
    records: [
      ...context.records,
      {
        id: "r2",
        date: "2026-11-08",
        diagnosis: "",
        conditions: [
          { name: "만성 신장질환", status: "suspected", note: "재확인 예정" },
        ],
      },
    ],
  });
  assert.match(facts.summary, /의심 소견/);
  assert.match(facts.summary, /승모판/);
});

test("the latest clinical clock time wins even when an older visit was uploaded afterward", () => {
  const facts = groundedFacts({
    ...context,
    records: [
      { ...context.records[0], id: "morning", time: "09:00" },
      {
        ...context.records[0],
        id: "evening",
        time: "18:00",
        conditions: [
          { name: "만성 신장질환", status: "suspected", note: "재확인" },
        ],
      },
    ],
  });
  assert.match(facts.current[0].text, /18:00/);
  assert.match(facts.current[0].text, /의심 소견/);
  assert.deepEqual(facts.current[0].sourceIds, ["evening"]);
});
test("medical watches require the disease and an actual source record", () => {
  const item = {
    sourceIds: ["r1"],
    referenceIds: ["aaha-diabetes"],
    possibility: "저혈당 여부를 추가로 확인할 필요가 있어요.",
    prepare: "기록을 가지고 수의사에게 상담해 주세요.",
  };
  assert.equal(supportedWatch(item, context), false);
  assert.equal(
    supportedWatch(
      { ...item, sourceIds: ["invented"], referenceIds: ["iris-kidney"] },
      context,
    ),
    false,
  );
});

test("a senior-care citation cannot justify a single unrelated condition", () => {
  assert.equal(
    supportedWatch(
      {
        sourceIds: ["ear"],
        referenceIds: ["aaha-senior"],
        possibility: "외이염의 지속적인 관리가 필요할 수 있습니다.",
        prepare: "기존 기록을 준비해서 주치의와 확인해 주세요.",
      },
      {
        ...context,
        records: [
          {
            id: "ear",
            date: "2026-11-07",
            diagnosis: "외이염",
            conditions: [{ name: "외이염", status: "diagnosed", note: "" }],
          },
        ],
      },
    ),
    false,
  );
});
test("unsupported recovery claims and literal placeholders are rejected", () => {
  const item = {
    sourceIds: ["r1"],
    referenceIds: ["merck-heart"],
    possibility: "승모판 질환은 호전되어 걱정하지 않아도 됩니다.",
    prepare: "증상을 기록하고 다음 진료에서 확인해 주세요.",
  };
  assert.equal(supportedWatch(item, context), false);
  assert.equal(
    supportedWatch({ ...item, possibility: "가능성" }, context),
    false,
  );
});
test("the briefing does not become a new dose or treatment instruction", () => {
  const item = {
    sourceIds: ["r1"],
    referenceIds: ["iris-kidney"],
    possibility: "신장질환 기록과 검사 결과를 함께 확인할 필요가 있어요.",
    prepare: "약을 중단하세요. 다음 진료에서 확인하세요.",
  };
  assert.equal(supportedWatch(item, context), false);
  assert.equal(
    supportedWatch(
      {
        ...item,
        prepare: "현재 처방전과 최근 검사를 가지고 주치의와 확인해 주세요.",
      },
      context,
    ),
    true,
  );
});
test("history alone is not evidence for relapse and does not create a new test order", () => {
  const item = {
    sourceIds: ["r1"],
    referenceIds: ["merck-heart"],
    possibility: "과거 승모판 질환이 있어 재발할 수 있습니다.",
    prepare: "정기적인 심장 검사를 실시해야 합니다.",
  };
  assert.equal(supportedWatch(item, context), false);
  assert.ok(!groundedPreparation(item).includes("검사를 실시"));
  assert.match(groundedPreparation(item), /기록/);
});

const skinContext = (
  status: "diagnosed" | "suspected" | "history" | "resolved" = "diagnosed",
): BriefContext => ({
  ...context,
  records: [
    {
      id: "skin-2021",
      date: "2021-11-07",
      diagnosis: "피부사상균증",
      conditions: [{ name: "피부사상균증", status, note: "" }],
    },
  ],
  currentMedications: [],
});

test("an old dermatophytosis diagnosis without drugs still provides sourced observations and visit questions", () => {
  const skin = skinContext();
  const result = completeFollowUp(skin, { watch: [], questions: [] });
  assert.equal(result.watch.length, 1);
  assert.deepEqual(result.watch[0].sourceIds, ["skin-2021"]);
  assert.deepEqual(result.watch[0].referenceIds, ["merck-dermatophytosis"]);
  assert.equal(supportedWatch(result.watch[0], skin), true);
  assert.match(result.watch[0].possibility, /2021-11-07/);
  assert.match(result.watch[0].prepare, /사진/);
  assert.equal(result.questions.length, 3);
  assert.ok(!JSON.stringify(result).includes("재발"));
});

test("suspected and past skin findings are not presented as confirmed current infection", () => {
  for (const status of ["suspected", "history"] as const) {
    const result = completeFollowUp(skinContext(status), {
      watch: [],
      questions: [],
    });
    assert.match(
      result.watch[0].possibility,
      status === "suspected" ? /의심 소견/ : /과거 병력/,
    );
    assert.match(result.watch[0].possibility, /현재 감염/);
    assert.match(result.questions[2], /현재 감염이 확인된다면/);
  }
});

test("a later resolved skin status takes precedence over older diagnoses and generated skin claims", () => {
  const skin = skinContext();
  skin.records.push({
    ...skin.records[0],
    id: "resolved",
    date: "2022-01-01",
    conditions: [{ name: "ringworm", status: "resolved", note: "" }],
  });
  const generated = {
    title: "오래된 진단",
    possibility: "이전 진단을 근거로 현재 감염을 확진합니다.",
    prepare: "기존 진료 기록을 준비해 주세요.",
    sourceIds: ["skin-2021"],
    referenceIds: ["merck-dermatophytosis"],
  };
  const result = completeFollowUp(skin, { watch: [generated], questions: [] });
  assert.equal(result.watch.length, 1);
  assert.deepEqual(result.watch[0].sourceIds, ["resolved"]);
  assert.match(result.watch[0].possibility, /호전·종료 기록/);
  assert.ok(
    !result.questions.some((q) => q.includes("현재 감염이 확인된다면")),
  );
});

test("a legacy diagnosis can be used, but a mention in notes, negation or antifungal medication is not a diagnosis", () => {
  const legacy = skinContext();
  legacy.records[0].conditions = [];
  assert.equal(
    completeFollowUp(legacy, { watch: [], questions: [] }).watch.length,
    1,
  );
  const unrelated: BriefContext = {
    ...context,
    records: [
      {
        ...context.records[0],
        diagnosis: "피부사상균증 아님",
        conditions: [
          {
            name: "외이염",
            status: "diagnosed",
            note: "피부사상균증 검사 음성",
          },
        ],
      },
    ],
    currentMedications: [{ name: "항진균제" }],
  };
  const result = completeFollowUp(unrelated, { watch: [], questions: [] });
  assert.equal(result.watch.length, 0);
  assert.match(result.questions[0], /외이염/);
  assert.equal(
    supportedWatch(
      {
        ...completeFollowUp(legacy, { watch: [], questions: [] }).watch[0],
        sourceIds: ["r1"],
      },
      unrelated,
    ),
    false,
  );
});

test("unrecognized diseases get a record-based question without inventing a medical watch or citation", () => {
  const result = completeFollowUp(
    {
      ...context,
      records: [
        {
          ...context.records[0],
          conditions: [{ name: "기타 병력", status: "history", note: "" }],
        },
      ],
    },
    { watch: [], questions: [] },
  );
  assert.deepEqual(result.watch, []);
  assert.match(result.questions[0], /기타 병력\(과거 병력\)/);
});

test("skin follow-up retains an existing question about another documented condition", () => {
  const question =
    "기존 신장질환의 검사 결과와 재진 계획에서 확인할 점은 무엇인가요?";
  const result = completeFollowUp(skinContext(), {
    watch: [],
    questions: [question],
  });
  assert.equal(result.questions.length, 3);
  assert.ok(result.questions.includes(question));
});
