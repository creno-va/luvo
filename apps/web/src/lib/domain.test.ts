import { test } from "node:test";
import assert from "node:assert/strict";
import { healthPeriods } from "./periods.ts";
import { durationEndDate, formatDoseTime } from "./prescription-review.ts";
import {
  timelineEntries,
  compareDocuments,
  documentDateLabel,
} from "./chronology.ts";
import {
  applyPrescription,
  doseKey,
  emptyState,
  isPrescribed,
  pausedAt,
  revisionAt,
  scheduleFor,
  toggleCheck,
  toggleMedication,
  validateItems,
  type DocumentRecord,
} from "./domain.ts";

const date = "2026-11-07";
const localISO = (time: string) => new Date(`${date}T${time}:00`).toISOString();
function document(
  fingerprint = "first",
  startDate = date,
  dose = "1회 1정",
): DocumentRecord {
  return {
    id: fingerprint,
    fingerprint,
    filename: "test.png",
    date: startDate,
    diagnosis: "",
    summary: "",
    createdAt: "2026-11-07T00:00:00Z",
    items: [
      {
        name: "약 A",
        dose,
        times: ["08:00", "20:00"],
        durationDays: "8일",
      },
    ],
  };
}
test("an earlier prescription uploaded later does not replace the current prescription", () => {
  let s = applyPrescription(emptyState(), document("new", date, "2정"));
  s = applyPrescription(s, document("old", "2026-11-01", "1정"));
  assert.equal(s.medications.length, 1);
  assert.equal(revisionAt(s.medications[0], date)?.dose, "2정");
  assert.equal(revisionAt(s.medications[0], "2026-11-03")?.dose, "1정");
});

test("new documents exclude clinical times and same-day order never uses upload timestamps", () => {
  const morning = {
    ...document("morning", date, "1정"),
    time: "09:30",
    createdAt: "2026-11-20T00:00:00Z",
  };
  const evening = {
    ...document("evening", date, "2정"),
    time: "18:00",
    createdAt: "2026-11-10T00:00:00Z",
  };
  let s = applyPrescription(emptyState(), evening);
  s = applyPrescription(s, morning);
  assert.ok(s.documents.every((d) => !Object.hasOwn(d, "time")));
  assert.deepEqual(
    timelineEntries(s).map((e) => e.at),
    [date, date],
  );
  assert.ok(
    s.documents.toSorted(compareDocuments).every((d) => d.date === date),
  );
  assert.equal(s.documents[0].createdAt, morning.createdAt);
});

test("date-only records never become upload time or an invented midnight and legacy activities are derived from documents", () => {
  const old = {
    ...document("old", "2024-03-02"),
    createdAt: "2026-11-07T12:30:00Z",
  };
  const s = applyPrescription(emptyState(), old);
  s.activities[0].at = old.createdAt;
  const entry = timelineEntries(s)[0];
  assert.equal(entry.at, "2024-03-02");
  assert.equal(entry.dateOnly, true);
  assert.equal(documentDateLabel(old), "2024-03-02");
  assert.equal(timelineEntries({ ...s, activities: [] }).length, 1);
});

test("manual pause and actual dose-check times remain actual action timestamps", () => {
  let s = applyPrescription(emptyState(), document());
  const id = s.medications[0].id;
  s = toggleCheck(s, doseKey(id, date, "08:00"), localISO("08:03"));
  s = toggleMedication(s, id, localISO("09:00"));
  const entries = timelineEntries(s);
  assert.deepEqual(
    entries.map((e) => e.type),
    ["pause", "check", "document"],
  );
  assert.equal(entries[0].at, localISO("09:00"));
  assert.equal(entries[1].at, localISO("08:03"));
});

test("invalid document dates are rejected while removed fields are never stored", () => {
  assert.throws(
    () => applyPrescription(emptyState(), { ...document(), date: "" }),
    /진료 날짜/,
  );
  const source = {
    ...document(),
    clinic: "삭제 대상",
    time: "25:00",
    onsetDate: "2026-01-01",
    prognosis: "삭제 대상",
  };
  const state = applyPrescription(emptyState(), source);
  for (const key of ["clinic", "time", "onsetDate", "prognosis"])
    assert.ok(!Object.hasOwn(state.documents[0], key));
});

test("pause and resume record an interval and preserve the prescription", () => {
  let s = applyPrescription(emptyState(), document());
  const id = s.medications[0].id;
  s = toggleMedication(s, id, localISO("09:00"));
  assert.equal(pausedAt(s.medications[0], localISO("08:00")), false);
  assert.equal(pausedAt(s.medications[0], localISO("20:00")), true);
  s = toggleMedication(s, id, localISO("19:00"));
  assert.equal(pausedAt(s.medications[0], localISO("18:00")), true);
  assert.equal(pausedAt(s.medications[0], localISO("20:00")), false);
  assert.equal(s.medications[0].revisions.length, 1);
});
test("a new prescription preserves an open pause", () => {
  let s = applyPrescription(emptyState(), document());
  s = toggleMedication(s, s.medications[0].id, localISO("09:00"));
  s = applyPrescription(s, document("changed", date, "3정"));
  assert.equal(s.medications[0].pauses[0].end, null);
  assert.equal(revisionAt(s.medications[0], date)?.dose, "3정");
});
test("missing medications in a new document are not implicitly stopped", () => {
  let s = applyPrescription(emptyState(), document());
  const next = document("other");
  next.items[0].name = "약 B";
  s = applyPrescription(s, next);
  assert.equal(s.medications.filter((m) => isPrescribed(m, date)).length, 2);
});
test("expired prescriptions are excluded even after the toggle is resumed", () => {
  let s = applyPrescription(emptyState(), document());
  const id = s.medications[0].id;
  s = toggleMedication(s, id, localISO("09:00"));
  s = toggleMedication(s, id, "2026-11-20T09:00:00Z");
  assert.equal(isPrescribed(s.medications[0], "2026-11-20"), false);
  assert.equal(scheduleFor(s, "2026-11-20").length, 0);
});
test("duplicate uploads do not create duplicate documents or revisions", () => {
  const s = applyPrescription(emptyState(), document());
  assert.throws(() => applyPrescription(s, document()), /이미 등록/);
  assert.equal(s.documents.length, 1);
  assert.equal(s.medications[0].revisions.length, 1);
});
test("dose checks are scoped to medication, local date, and scheduled time", () => {
  let s = applyPrescription(emptyState(), document());
  const id = s.medications[0].id;
  s = toggleCheck(s, doseKey(id, date, "08:00"), localISO("08:03"));
  assert.ok(scheduleFor(s, date)[0].checkedAt);
  assert.equal(scheduleFor(s, date)[1].checkedAt, undefined);
  assert.equal(scheduleFor(s, "2026-11-08")[0].checkedAt, undefined);
  s = toggleCheck(s, doseKey(id, date, "08:00"));
  assert.equal(Object.keys(s.checks).length, 0);
});
test("pause does not discard completed doses or rewrite historical checks", () => {
  let s = applyPrescription(emptyState(), document());
  const id = s.medications[0].id;
  s = toggleCheck(s, doseKey(id, date, "08:00"), localISO("08:03"));
  s = toggleMedication(s, id, localISO("09:00"));
  const items = scheduleFor(s, date);
  assert.ok(items[0].checkedAt);
  assert.equal(items[0].paused, false);
  assert.equal(items[1].paused, true);
});
test("missing, invalid and duplicate 24-hour times require review", () => {
  const d = document();
  for (const times of [[], ["25:00"], ["오후 8:00"], ["08:00", "08:00"]]) {
    d.items[0].times = times;
    assert.match(validateItems(d.items)!, /시간/);
  }
});

test("a diagnosis document can be recorded without creating a medication", () => {
  const doc = document();
  doc.items = [];
  doc.diagnosis = "처방이 없는 진료 메모";
  const s = applyPrescription(emptyState(), doc);
  assert.equal(s.documents.length, 1);
  assert.equal(s.medications.length, 0);
});
test("repeated medication names need review instead of losing one dose plan", () => {
  const doc = document();
  doc.items.push({ ...doc.items[0], dose: "2정", times: ["20:00"] });
  assert.match(validateItems(doc.items)!, /같은 이름/);
});
test("a dose record keeps the dose that was checked even after a same-day prescription update", () => {
  let s = applyPrescription(emptyState(), document());
  const id = s.medications[0].id;
  const key = doseKey(id, date, "08:00");
  s = toggleCheck(s, key, localISO("08:03"));
  s = applyPrescription(s, document("changed", date, "2정"));
  assert.equal(scheduleFor(s, date)[0].revision.dose, "1회 1정");
  assert.equal(scheduleFor(s, date)[1].revision.dose, "2정");
  assert.equal(s.doseSnapshots?.[key].documentId, "first");
  s = toggleCheck(s, key);
  assert.equal(s.doseSnapshots?.[key], undefined);
});

test("completed doses remain visible when a later prescription removes their time slot", () => {
  let s = applyPrescription(emptyState(), document());
  const id = s.medications[0].id;
  s = toggleCheck(s, doseKey(id, date, "08:00"), localISO("08:03"));
  const changed = document("changed-times", date, "2정");
  changed.items[0].times = ["12:00"];
  s = applyPrescription(s, changed);
  const rows = scheduleFor(s, date);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].time, "08:00");
  assert.ok(rows[0].checkedAt);
  assert.equal(rows[0].revision.dose, "1회 1정");
  assert.equal(rows[1].time, "12:00");
});

test("illness periods describe documented observations without inventing onset or recovery", () => {
  let s = applyPrescription(emptyState(), {
    ...document("first-visit", "2026-11-01"),
    conditions: [{ name: "질환 A", status: "diagnosed", note: "" }],
  });
  s = applyPrescription(s, {
    ...document("resolved", "2026-11-07"),
    conditions: [{ name: "질환 A", status: "resolved", note: "종료 기재" }],
  });
  const period = healthPeriods(s).find((p) => p.type === "condition")!;
  assert.equal(period.start, "2026-11-01");
  assert.equal(period.end, "2026-11-07");
  assert.match(period.note, /발병일이 아닌/);
  s = applyPrescription(s, {
    ...document("unknown", "2026-11-08"),
    conditions: [{ name: "질환 B", status: "history", note: "" }],
  });
  const unknown = healthPeriods(s).find((p) => p.name === "질환 B")!;
  assert.equal(unknown.end, "");
  assert.match(unknown.label, /미확인/);
});
test("medication periods split at prescription changes and retain pauses spanning a new prescription", () => {
  let s = applyPrescription(emptyState(), document("first", "2026-11-01"));
  s = toggleMedication(s, s.medications[0].id, "2026-11-02T09:00:00Z");
  s = applyPrescription(s, document("changed", "2026-11-07", "2정"));
  const periods = healthPeriods(s).filter((p) => p.type === "medication");
  assert.equal(periods.length, 2);
  assert.equal(periods[0].start, "2026-11-07");
  assert.match(periods[0].note, /복용 쉼 2026-11-02 — 현재/);
  assert.equal(periods[1].end, "2026-11-07");
});

test("only an explicit course length and confirmed start date suggest a review end date", () => {
  assert.equal(durationEndDate("2026-11-07", "7일"), "2026-11-13");
  assert.equal(durationEndDate("2024-02-28", "3일"), "2024-03-01");
  for (const duration of ["1일 2회", "14정", "0일", "유효기간 3일"])
    assert.equal(durationEndDate("2026-11-07", duration), "");
  assert.equal(durationEndDate("", "7일"), "");
  const d = document();
  d.items[0].durationDays = "7일";
  const state = applyPrescription(emptyState(), d);
  assert.equal(state.medications[0].revisions[0].startDate, d.date);
  assert.equal(state.medications[0].revisions[0].endDate, "2026-11-13");
  assert.ok(!Object.hasOwn(state.documents[0].items[0], "startDate"));
  assert.ok(!Object.hasOwn(state.documents[0].items[0], "endDate"));
});

test("24-hour text inputs insert a colon for numeric mobile keyboards", () => {
  assert.equal(formatDoseTime("2000"), "20:00");
  assert.equal(formatDoseTime("08:30"), "08:30");
  assert.equal(formatDoseTime("2"), "2");
});
