import assert from "node:assert/strict";
import { test } from "node:test";
import { medicationList } from "./medication-list.ts";
import {
  applyPrescription,
  emptyState,
  toggleMedication,
  toggleCheck,
  type DocumentRecord,
} from "./domain.ts";

function doc(name: string, date: string, durationDays: string): DocumentRecord {
  return {
    id: name,
    fingerprint: name,
    filename: "",
    date,
    diagnosis: "",
    summary: "",
    createdAt: `${date}T10:00:00Z`,
    items: [{ name, dose: "1정", times: ["08:00"], durationDays }],
  };
}
function fixture() {
  let pet = emptyState();
  pet = applyPrescription(pet, doc("이전 약", "2026-10-01", "3"));
  pet = applyPrescription(pet, doc("오늘 약", "2026-11-07", "3"));
  return applyPrescription(pet, doc("시작 전 약", "2026-12-01", "3"));
}
test("today-only hides past and future plans; all records show their status without changing data", () => {
  const pet = fixture();
  const before = structuredClone(pet);
  assert.deepEqual(
    medicationList(pet, "2026-11-07", true).medications.map((m) => m.med.name),
    ["오늘 약"],
  );
  const all = medicationList(pet, "2026-11-07", false).medications;
  assert.deepEqual(
    all.map((m) => m.status),
    ["처방 기간 종료", "복용 중", "시작 전"],
  );
  assert.deepEqual(
    all.map((m) => m.prescribed),
    [false, true, false],
  );
  assert.equal(medicationList(pet, "2026-11-10", true).medications.length, 0);
  assert.deepEqual(pet, before);
});
test("a paused current prescription stays visible to allow resume", () => {
  const pet = fixture();
  const med = pet.medications.find((m) => m.name === "오늘 약")!;
  const paused = toggleMedication(pet, med.id, "2026-11-07T00:00:00Z");
  assert.equal(
    medicationList(paused, "2026-11-07", true).medications[0].status,
    "복용 중단",
  );
});
test("completed same-day doses stay visible after a stop record", () => {
  let pet = fixture();
  const med = pet.medications.find((m) => m.name === "오늘 약")!;
  pet = toggleCheck(pet, `${med.id}|2026-11-07|08:00`, "2026-11-07T08:00:00Z");
  const updated = pet.medications.find((m) => m.id === med.id)!;
  updated.revisions.push({
    ...updated.revisions[0],
    documentId: "00-stop",
    action: "stop",
  });
  const list = medicationList(pet, "2026-11-07", true);
  assert.equal(list.medications[0].status, "중단 기록");
  assert.equal(list.medications[0].prescribed, false);
  assert.ok(list.rows[0].checkedAt);
});
