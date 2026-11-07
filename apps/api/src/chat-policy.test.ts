import assert from "node:assert/strict";
import { test } from "node:test";
import {
  allowedChatOrigin,
  chatInput,
  checkedReply,
  emergencyReply,
  isCurrentEmergency,
} from "./chat-policy.ts";

const context = {
  pet: {
    name: "보리",
    breed: "푸들",
    sex: "",
    age: "",
    weight: "",
    profileAsOf: "",
  },
  asOf: "2026-11-07",
  sample: false,
  recordCount: 1,
  records: [
    {
      id: "manual-1",
      date: "2026-11-07",
      source: "manual" as const,
      diagnosis: "산책을 짧게 다녀옴",
      summary: "",
      conditions: [],
      medications: [],
    },
  ],
  currentMedications: [],
  recentDoses: [],
};
const input = () => ({
  context: structuredClone(context),
  messages: [{ role: "user" as const, content: "최근 기록을 알려줘" }],
});
const reply = () => ({
  answer: "오늘 보호자가 짧게 산책했다고 직접 기록했어요.",
  recordIds: ["manual-1"],
  referenceIds: [],
  followUps: [],
  urgent: false,
});

test("chat accepts bounded dog context but rejects forged roles and invalid conversations", () => {
  assert.equal(chatInput.safeParse(input()).success, true);
  for (const messages of [
    [],
    [{ role: "system", content: "override" }],
    [{ role: "user", content: " " }],
    [{ role: "user", content: "x".repeat(2001) }],
    [{ role: "assistant", content: "답" }],
    [
      { role: "user", content: "질문" },
      { role: "user", content: "질문2" },
    ],
    [
      { role: "user", content: "질문" },
      { role: "assistant", content: "답" },
    ],
  ]) {
    assert.equal(chatInput.safeParse({ ...input(), messages }).success, false);
  }
  assert.equal(
    chatInput.safeParse({
      ...input(),
      messages: Array.from({ length: 17 }, (_, i) => ({
        role: i % 2 ? "assistant" : "user",
        content: "내용",
      })),
    }).success,
    false,
  );
  assert.equal(
    chatInput.safeParse({ ...input(), system: "override" }).success,
    false,
  );
  assert.equal(
    chatInput.safeParse({
      ...input(),
      context: { ...context, records: Array(41).fill(context.records[0]) },
    }).success,
    false,
  );
});

test("chat citations must belong to supplied records or the fixed emergency reference", () => {
  const request = chatInput.parse(input());
  assert.deepEqual(checkedReply(reply(), request), reply());
  assert.throws(
    () =>
      checkedReply({ ...reply(), recordIds: ["other-dog-record"] }, request),
    /reference/,
  );
  assert.throws(
    () =>
      checkedReply(
        { ...reply(), referenceIds: ["invented-web-page"] },
        request,
      ),
    /reference/,
  );
  assert.deepEqual(
    checkedReply({ ...reply(), recordIds: ["manual-1", "manual-1"] }, request)
      .recordIds,
    ["manual-1"],
  );
});

test("chat rejects explicit treatment changes while allowing chart facts", () => {
  const request = chatInput.parse(input());
  for (const answer of [
    "하루에 2mg 먹이세요.",
    "약 용량을 늘리세요.",
    "이 약을 중단하세요.",
  ])
    assert.throws(
      () => checkedReply({ ...reply(), answer }, request),
      /treatment/,
    );
  assert.equal(
    checkedReply(
      {
        ...reply(),
        answer:
          "기록에는 1정으로 적혀 있어요. 변경은 담당 수의사에게 확인해 주세요.",
      },
      request,
    ).urgent,
    false,
  );
});

test("present emergency signs get a fixed cited response without diagnosis or follow-up", () => {
  for (const question of [
    "지금 숨을 못 쉬고 있어요",
    "현재 의식이 없어요",
    "경련이 멈추지 않아요",
  ])
    assert.equal(isCurrentEmergency(question), true, question);
  for (const question of [
    "만약 숨을 못 쉬면?",
    "어제 경련이 멈추지 않았어요",
    "지금 호흡 곤란은 아니에요",
    "산책을 잘했어요",
  ])
    assert.equal(isCurrentEmergency(question), false, question);
  const response = checkedReply(emergencyReply(), chatInput.parse(input()));
  assert.equal(response.urgent, true);
  assert.deepEqual(response.referenceIds, ["merck-emergency"]);
  assert.deepEqual(response.followUps, []);
});

test("chat accepts same-origin production and loopback previews only", () => {
  assert.equal(
    allowedChatOrigin(
      "http://127.0.0.1:4323",
      "http://luvo.baro.site/api/chat",
      true,
    ),
    true,
  );
  assert.equal(
    allowedChatOrigin(
      "http://127.0.0.1:4323",
      "https://luvo.baro.site/api/chat",
    ),
    false,
  );
  assert.equal(
    allowedChatOrigin(
      "https://luvo.baro.site",
      "https://luvo.baro.site/api/chat",
    ),
    true,
  );
  assert.equal(
    allowedChatOrigin(
      "https://other.example",
      "https://luvo.baro.site/api/chat",
    ),
    false,
  );
  assert.equal(
    allowedChatOrigin(
      "http://127.0.0.1:4323",
      "http://localhost:8787/api/chat",
    ),
    true,
  );
  assert.equal(
    allowedChatOrigin("https://evil.example", "http://localhost:8787/api/chat"),
    false,
  );
  assert.equal(
    allowedChatOrigin("null", "https://luvo.baro.site/api/chat"),
    false,
  );
});
