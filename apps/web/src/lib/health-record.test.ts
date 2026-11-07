import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import { manualDraft, draftDocument } from "./health-record.ts";
import { emptyState, sampleState, scheduleFor } from "./domain.ts";
import {
  emptyHousehold,
  ingestDocument,
  briefingContext,
  migrateStore,
} from "./household.ts";
import { writeState, readState, readFile } from "./storage.ts";
import { timelineEntries } from "./chronology.ts";

test("removed sample data never populates a real manual record", () => {
  const draft = manualDraft(sampleState(), "2026-11-07");
  assert.equal(draft.file, undefined);
  assert.equal(draft.extraction.animal.name, "");
  assert.equal(draft.targetPetId, "new");
  assert.deepEqual(draft.extraction.conditions, []);
  assert.equal(draft.extraction.date, "2026-11-07");
  assert.deepEqual(draft.extraction.medications, []);
  assert.notEqual(draft.fingerprint, manualDraft().fingerprint);
});

test("a text-only record registers a dog and keeps manual provenance in storage and briefing", async () => {
  const draft = manualDraft(undefined, "2026-11-07");
  draft.extraction.animal.name = "수기 테스트견";
  draft.extraction.diagnosis = "저녁에 산책을 짧게 다녀옴.";
  const record = draftDocument(draft);
  const store = ingestDocument(emptyHousehold(), record);
  await writeState(store);
  const loaded = await readState();
  assert.equal(loaded.pets[0].documents[0].source, "manual");
  assert.equal(loaded.pets[0].documents[0].filename, "");
  assert.equal(await readFile(record.id), undefined);
  assert.equal(loaded.pets[0].medications.length, 0);
  assert.equal(briefingContext(loaded.pets[0]).records[0].source, "manual");
  assert.match(timelineEntries(loaded.pets[0])[0].title, /직접 입력/);
  assert.deepEqual(migrateStore(loaded), loaded);
});

test("existing dog identity is reused and blank manual records cannot be saved", () => {
  const pet = emptyState();
  pet.profile = {
    name: "보리",
    breed: "푸들",
    sex: "암컷",
    age: "7세",
    weight: "4.2 kg",
    detail: "푸들",
  };
  const draft = manualDraft(pet, "2026-11-07");
  const store = { version: 3 as const, activePetId: pet.id, pets: [pet] };
  assert.equal(draft.targetPetId, pet.id);
  assert.deepEqual(draft.extraction.animal, {
    name: "보리",
    breed: "푸들",
    sex: "암컷",
    age: "7세",
    weight: "4.2 kg",
  });
  assert.throws(
    () => ingestDocument(store, draftDocument(draft), pet.id),
    /건강 기록이나 약 정보/,
  );
  draft.extraction.diagnosis = "오늘 관찰한 내용";
  assert.equal(
    ingestDocument(store, draftDocument(draft), pet.id).pets.length,
    1,
  );
});

test("a new dog entry stays blank and editing a prefilled draft does not change the saved profile", () => {
  const pet = emptyState();
  pet.profile = { name: "보리", breed: "푸들", detail: "푸들" };
  const draft = manualDraft(pet);
  draft.extraction.animal.name = "입력 중 수정";
  assert.equal(pet.profile.name, "보리");
  const fresh = manualDraft();
  assert.equal(fresh.targetPetId, "new");
  assert.deepEqual(fresh.extraction.animal, {
    name: "",
    breed: "",
    sex: "",
    age: "",
    weight: undefined,
  });
});

test("optional medication-only manual entry keeps the existing schedule validation", () => {
  const draft = manualDraft(undefined, "2026-11-07");
  draft.extraction.animal.name = "보리";
  draft.extraction.medications = [
    { name: "가상약", dose: "1정", times: ["20:00"], durationDays: "3일" },
  ];
  const store = ingestDocument(emptyHousehold(), draftDocument(draft));
  assert.equal(scheduleFor(store.pets[0], "2026-11-07")[0].time, "20:00");
  assert.equal(scheduleFor(store.pets[0], "2026-11-10").length, 0);
  draft.extraction.medications[0].times = [];
  assert.throws(
    () => ingestDocument(emptyHousehold(), draftDocument(draft)),
    /시간/,
  );
});

test("photo OCR fallback keeps its attachment and photo provenance", () => {
  const draft = manualDraft();
  draft.file = new File(["fixture"], "prescription.png", { type: "image/png" });
  draft.documentKind = "prescription";
  const record = draftDocument(draft);
  assert.equal(record.source, "photo");
  assert.equal(record.filename, "prescription.png");
});
