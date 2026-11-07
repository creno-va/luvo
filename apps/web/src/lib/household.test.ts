import "fake-indexeddb/auto";
import { test } from "node:test";
import assert from "node:assert/strict";
import { openDB } from "idb";
import {
  emptyHousehold,
  ingestDocument,
  activePet,
  resolvePatient,
  briefingContext,
  replacePet,
  contextHash,
} from "./household.ts";
import {
  emptyState,
  toggleCheck,
  toggleMedication,
  type AnimalInfo,
  type DocumentRecord,
} from "./domain.ts";
import { readState, readFile } from "./storage.ts";

const patient = (name = "두부"): AnimalInfo => ({
  name,
  breed: "말티즈",
  sex: "암컷",
  age: "7세",
  birthDate: "",
});
function doc(id = "first", name = "두부", date = "2026-11-07"): DocumentRecord {
  return {
    id,
    fingerprint: id,
    filename: `${id}.png`,
    date,
    clinic: "가상병원",
    diagnosis: "문서상 만성 병력",
    summary: "가상 기록",
    createdAt: `${date}T08:00:00Z`,
    animal: patient(name),
    conditions: [
      { name: "신장질환", status: "diagnosed", note: "진단서에 기재됨" },
    ],
    items: [
      {
        name: "가상약 A",
        dose: "1정",
        times: ["08:00", "20:00"],
        startDate: date,
        endDate: "2026-12-01",
        instructions: "",
        action: "prescribe",
      },
    ],
  };
}
test("first document creates the dog and all newly prescribed drugs start ON", () => {
  const store = ingestDocument(emptyHousehold(), doc());
  const pet = activePet(store)!;
  assert.equal(store.pets.length, 1);
  assert.equal(pet.profile.name, "두부");
  assert.equal(pet.profile.breed, "말티즈");
  assert.equal(pet.profile.sex, "암컷");
  assert.equal(pet.profile.age, "7세");
  assert.equal(pet.medications[0].pauses.length, 0);
  assert.match(pet.profile.detail, /7세/);
});
test("a different patient creates another isolated record, not another illness of the first dog", () => {
  const a = ingestDocument(emptyHousehold(), doc());
  const b = ingestDocument(a, doc("second", "콩이"));
  assert.equal(b.pets.length, 2);
  assert.equal(activePet(b)?.profile.name, "콩이");
  assert.equal(b.pets[0].documents.length, 1);
  assert.equal(b.pets[0].documents[0].id, "first");
});
test("another visit updates only the matched dog while preserving its pause and dose history", () => {
  let s = ingestDocument(
    ingestDocument(emptyHousehold(), doc()),
    doc("second", "콩이"),
  );
  const id = s.pets[0].id;
  s = replacePet(s, id, (p) =>
    toggleCheck(
      toggleMedication(p, p.medications[0].id, "2026-11-07T09:00:00Z"),
      "some-dose",
    ),
  );
  const before = structuredClone(s.pets[1]);
  s = ingestDocument(s, doc("third", "두부", "2026-11-08"));
  assert.equal(s.pets.length, 2);
  assert.equal(activePet(s)?.id, id);
  assert.equal(s.pets[0].documents.length, 2);
  assert.equal(s.pets[0].medications[0].pauses[0].end, null);
  assert.ok(s.pets[0].checks["some-dose"]);
  assert.deepEqual(s.pets[1], before);
});
test("same name with conflicting identity asks instead of merging dogs", () => {
  const s = ingestDocument(emptyHousehold(), doc());
  const different = { ...patient(), breed: "푸들" };
  assert.equal(resolvePatient(s.pets, different).kind, "review");
  const incoming = { ...doc("other"), animal: different };
  assert.throws(() => ingestDocument(s, incoming), /골라/);
  const explicit = ingestDocument(s, incoming, "new");
  assert.equal(explicit.pets.length, 2);
});
test("unnamed OCR does not silently become the currently selected dog", () => {
  const s = ingestDocument(emptyHousehold(), doc());
  assert.equal(resolvePatient(s.pets, patient("")).kind, "review");
  assert.throws(
    () => ingestDocument(s, { ...doc("unknown"), animal: patient("") }),
    /이름/,
  );
});
test("late historical documents do not regress age or other newer profile information", () => {
  const a = ingestDocument(emptyHousehold(), doc());
  const old = doc("old", "두부", "2024-11-07");
  old.animal!.age = "5세";
  const b = ingestDocument(a, old);
  assert.equal(activePet(b)?.profile.age, "7세");
  assert.equal(activePet(b)?.documents.length, 2);
});
test("a briefing context includes older conditions and only the selected dog records", async () => {
  let s = ingestDocument(emptyHousehold(), doc());
  s = ingestDocument(s, doc("other-dog", "콩이"));
  const first = s.pets[0];
  const context = briefingContext(first, "2026-11-07");
  assert.equal(context.records[0].conditions[0].name, "신장질환");
  assert.ok(!JSON.stringify(context).includes("other-dog"));
  assert.equal(context.pet.name, "두부");
  const hash = await contextHash(context);
  assert.equal(hash, await contextHash(briefingContext(first, "2026-11-07")));
  assert.notEqual(
    hash,
    await contextHash(briefingContext(first, "2026-11-08")),
  );
});
test("duplicate images are rejected across all dogs", () => {
  const s = ingestDocument(emptyHousehold(), doc());
  assert.throws(
    () => ingestDocument(s, { ...doc(), animal: patient("다른 강아지") }),
    /이미 등록/,
  );
});
test("old browser records migrate once with stable identity, images and dose checks intact", async () => {
  const db = await openDB("luvo-local", 1, {
    upgrade(d) {
      d.createObjectStore("state");
      d.createObjectStore("files");
    },
  });
  const old: Record<string, unknown> = {
    ...emptyState(),
    documents: [doc("legacy")],
    checks: { "legacy-dose": "2026-11-07T08:00:00Z" },
  };
  delete old.id;
  delete old.revision;
  await db.put("state", old, "current");
  await db.put("files", new Blob(["legacy image"]), "legacy");
  const first = await readState();
  const second = await readState();
  assert.equal(first.version, 2);
  assert.equal(first.pets[0].id, second.pets[0].id);
  assert.equal(first.pets[0].checks["legacy-dose"], "2026-11-07T08:00:00Z");
  assert.equal(await (await readFile("legacy"))?.text(), "legacy image");
  assert.equal((await db.get("state", "current")).version, 2);
  db.close();
});
