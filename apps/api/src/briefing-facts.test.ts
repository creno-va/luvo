import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groundedFacts,
  supportedWatch,
  groundedPreparation,
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
