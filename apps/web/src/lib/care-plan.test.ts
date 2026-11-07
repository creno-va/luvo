import assert from "node:assert/strict";
import { test } from "node:test";
import { carePlan, careReferences } from "./care-plan.ts";
import { emptyState, type DocumentRecord } from "./domain.ts";

function record(id: string, text: string, date = "2026-11-07"): DocumentRecord {
  return {
    id,
    fingerprint: id,
    filename: "",
    date,
    source: "manual",
    kind: "note",
    diagnosis: text,
    summary: "",
    createdAt: `${date}T10:00:00Z`,
    items: [],
    conditions: [],
  };
}
test("preparation remains useful without AI results or a confirmed diagnosis", () => {
  const pet = emptyState();
  pet.documents = [record("first", "짧게 산책했어요")];
  const cards = carePlan(pet, "2026-11-07");
  assert.deepEqual(
    cards.map((c) => c.id),
    ["daily"],
  );
  assert.match(cards[0].reason, /직접 입력/);
  for (const card of cards) {
    assert.ok(card.actions.length >= 2);
    assert.ok(card.referenceIds.every((id) => careReferences[id]));
    assert.ok(card.sourceIds.every((id) => id === "first"));
  }
});
test("new observations immediately update topics and source links without reusing the last AI briefing", () => {
  const pet = emptyState();
  pet.documents = [record("first", "오늘 산책함")];
  const before = carePlan(pet, "2026-11-07");
  pet.documents.unshift(
    record("new", "저녁에 구토를 두 번 했고 기운이 줄었음"),
  );
  const after = carePlan(pet, "2026-11-07");
  assert.equal(
    before.some((c) => c.id === "digestive"),
    false,
  );
  assert.deepEqual(after.find((c) => c.id === "digestive")!.sourceIds, ["new"]);
  assert.match(after.find((c) => c.id === "digestive")!.reason, /보호자 메모/);
  assert.match(
    after.find((c) => c.id === "digestive")!.contact!,
    /병원에 바로 연락/,
  );
  assert.equal(pet.briefing, undefined);
});
test("past, future and explicitly absent symptoms do not become current symptom guidance", () => {
  const pet = emptyState();
  pet.documents = [
    record("old", "구토를 했음", "2026-09-01"),
    record("future", "기침", "2026-12-01"),
    record("absent", "구토 없음. 설사하지 않음. 기침 안함."),
  ];
  const cards = carePlan(pet, "2026-11-07");
  assert.equal(
    cards.some((c) => ["digestive", "breathing"].includes(c.id)),
    false,
  );
  assert.ok(cards.every((c) => !c.sourceIds.includes("future")));
});
test("skin and mobility records get relevant home guidance with primary references", () => {
  const pet = emptyState();
  pet.documents = [record("skin", "피부를 자주 긁음")];
  assert.deepEqual(
    carePlan(pet, "2026-11-07").find((c) => c.id === "skin-home")!.referenceIds,
    ["bathing"],
  );
  pet.documents = [record("joint", "관절 진료 후 보행 관찰 중")];
  const card = carePlan(pet, "2026-11-07").find(
    (c) => c.id === "mobility-home",
  )!;
  assert.deepEqual(card.sourceIds, ["joint"]);
  assert.deepEqual(card.referenceIds, ["mobility"]);
  assert.match(card.actions[0], /매트/);
});
test("one dog never inherits another dog topics or record IDs and samples do not generate care", () => {
  const first = emptyState();
  first.documents = [record("first", "기침")];
  const second = emptyState();
  second.documents = [record("second", "평소처럼 지냄")];
  assert.equal(
    carePlan(first, "2026-11-07").some((c) => c.id === "breathing"),
    true,
  );
  assert.equal(
    carePlan(second, "2026-11-07").some((c) => c.id === "breathing"),
    false,
  );
  assert.ok(
    carePlan(second, "2026-11-07").every((c) => !c.sourceIds.includes("first")),
  );
  first.sample = true;
  assert.deepEqual(carePlan(first, "2026-11-07"), []);
});

test("respiratory and digestive notes produce different actions without generic diet cards", () => {
  const pet = emptyState();
  pet.documents = [record("cough", "기침과 콧물, 식욕은 평소와 같음")];
  const respiratory = carePlan(pet, "2026-11-07");
  assert.match(respiratory[0].actions.join(" "), /편안한 공간에서 쉬/);
  assert.ok(!respiratory.some((c) => c.id === "home"));
  pet.documents = [record("stomach", "구토와 설사")];
  const digestive = carePlan(pet, "2026-11-07");
  assert.match(digestive[0].actions.join(" "), /토한 내용물/);
  assert.ok(!digestive[0].actions.join(" ").includes("다른 강아지"));
});
