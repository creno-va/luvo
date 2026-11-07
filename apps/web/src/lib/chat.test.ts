import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chatContext,
  chatReply,
  compactConversation,
  conversationHistory,
  type ChatMessage,
} from "./chat.ts";
import { emptyState, sampleState } from "./domain.ts";
import { emptyHousehold, ingestDocument } from "./household.ts";
import { draftDocument, manualDraft } from "./health-record.ts";
import {
  readConversation,
  readState,
  writeConversation,
  writeState,
} from "./storage.ts";

const message = (
  id: string,
  role: "user" | "assistant" = "user",
): ChatMessage => ({
  id,
  role,
  content: "기록을 알려줘",
  createdAt: "2026-11-07T10:00:00Z",
});

test("chat context uses the selected dog and keeps manual observations distinct from diagnoses", () => {
  const draft = manualDraft(undefined, "2026-11-07");
  draft.extraction.animal.name = "보리";
  draft.extraction.diagnosis = "저녁 산책을 짧게 다녀옴";
  const store = ingestDocument(emptyHousehold(), draftDocument(draft));
  const context = chatContext(store.pets[0]);
  assert.equal(context.pet.name, "보리");
  assert.equal(context.recordCount, 1);
  assert.equal(context.records[0].source, "manual");
  assert.deepEqual(context.records[0].conditions, []);
  assert.equal(JSON.stringify(context).includes("filename"), false);
  assert.deepEqual(context.currentMedications, []);
  assert.deepEqual(context.recentDoses, []);
  assert.equal(chatContext(sampleState()).sample, true);
});

test("only the latest 40 records and 15 alternating messages are sent", () => {
  const pet = sampleState();
  const record = pet.documents[0];
  pet.documents = Array.from({ length: 45 }, (_, i) => ({
    ...record,
    id: `doc-${i}`,
    date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
  }));
  assert.equal(chatContext(pet).records.length, 40);
  assert.equal(chatContext(pet).recordCount, 45);
  const messages = Array.from({ length: 101 }, (_, i) =>
    message(String(i), i % 2 ? "assistant" : "user"),
  );
  const history = conversationHistory(messages);
  assert.equal(history.length, 15);
  assert.equal(history[0].role, "user");
  assert.equal(history.at(-1)?.role, "user");
  assert.ok(compactConversation(messages).length <= 80);
});

test("saved messages ignore invalid content, duplicate IDs and forged references", () => {
  const messages = compactConversation([
    message("leading", "assistant"),
    message("u"),
    message("u"),
    { ...message("bad", "assistant"), content: "" },
    {
      ...message("a", "assistant"),
      referenceIds: ["invented", "merck-emergency"],
      recordIds: ["doc"],
      urgent: true,
    },
    message("u2"),
  ]);
  assert.deepEqual(
    messages.map((m) => m.id),
    ["u", "a", "u2"],
  );
  assert.deepEqual(messages[1].referenceIds, ["merck-emergency"]);
  assert.equal(messages[1].urgent, true);
  assert.throws(() =>
    chatReply({
      answer: "",
      recordIds: [],
      referenceIds: [],
      followUps: [],
      urgent: false,
    }),
  );
});

test("dog conversations persist independently without changing health records or dose checks", async () => {
  const pet = emptyState();
  pet.profile.name = "첫째";
  const other = emptyState();
  other.profile.name = "둘째";
  const household = {
    version: 3 as const,
    activePetId: pet.id,
    pets: [pet, other],
  };
  await writeState(household);
  const before = await readState();
  await writeConversation(pet.id, [message("pending")]);
  await writeConversation(other.id, [
    message("other"),
    message("reply", "assistant"),
  ]);
  assert.deepEqual(
    (await readConversation(pet.id)).map((m) => m.id),
    ["pending"],
  );
  assert.deepEqual(
    (await readConversation(other.id)).map((m) => m.id),
    ["other", "reply"],
  );
  assert.deepEqual(await readState(), before);
  await writeConversation(pet.id, [
    message("pending"),
    message("done", "assistant"),
  ]);
  assert.equal((await readConversation(pet.id)).at(-1)?.role, "assistant");
  assert.equal((await readConversation(other.id)).length, 2);
});
