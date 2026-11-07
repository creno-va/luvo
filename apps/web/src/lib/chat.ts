import type { AppState } from "./domain.ts";
import { briefingContext } from "./household.ts";

export const chatReferences = [
  {
    id: "merck-emergency",
    title: "Merck 반려동물 응급 진료 안내",
    url: "https://www.merckvetmanual.com/special-pet-topics/emergencies/evaluation-and-initial-treatment-of-dog-and-cat-emergencies",
  },
];
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  recordIds?: string[];
  referenceIds?: string[];
  followUps?: string[];
  urgent?: boolean;
};
export type ChatReply = {
  answer: string;
  recordIds: string[];
  referenceIds: string[];
  followUps: string[];
  urgent: boolean;
};

const strings = (value: unknown, max: number) =>
  Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === "string" && v.length <= 120)
        .slice(0, max)
    : [];
export function compactConversation(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ChatMessage[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    if (
      !raw ||
      typeof raw !== "object" ||
      !["user", "assistant"].includes(raw.role) ||
      typeof raw.id !== "string" ||
      raw.id.length > 100 ||
      ids.has(raw.id) ||
      typeof raw.content !== "string" ||
      !raw.content.trim() ||
      raw.content.length > 5000 ||
      typeof raw.createdAt !== "string" ||
      !Number.isFinite(Date.parse(raw.createdAt))
    )
      continue;
    if (raw.role === (messages.at(-1)?.role || "assistant")) continue;
    ids.add(raw.id);
    messages.push({
      id: raw.id,
      role: raw.role,
      content: raw.content,
      createdAt: raw.createdAt,
      ...(raw.role === "assistant"
        ? {
            recordIds: strings(raw.recordIds, 8),
            referenceIds: strings(raw.referenceIds, 3).filter((id) =>
              chatReferences.some((r) => r.id === id),
            ),
            followUps: strings(raw.followUps, 3),
            urgent: raw.urgent === true,
          }
        : {}),
    });
  }
  const kept = messages.slice(-80);
  if (kept[0]?.role === "assistant") kept.shift();
  return kept;
}
export function conversationHistory(messages: ChatMessage[]) {
  const recent = compactConversation(messages).slice(-15);
  if (recent[0]?.role === "assistant") recent.shift();
  return recent.map(({ role, content }) => ({ role, content }));
}
export function chatContext(pet: AppState) {
  const context = briefingContext(pet);
  return {
    pet: { ...context.pet, weight: pet.profile.weight || "" },
    asOf: context.asOf,
    sample: pet.sample,
    recordCount: pet.documents.length,
    records: context.records
      .slice(0, 40)
      .map((r) => ({
        id: r.id,
        date: r.date,
        source: r.source,
        diagnosis: r.diagnosis.slice(0, 800),
        summary: r.summary.slice(0, 600),
        conditions: r.conditions
          .slice(0, 10)
          .map((c) => ({ ...c, note: c.note.slice(0, 200) })),
        medications: r.medications
          .slice(0, 10)
          .map((m) => ({ name: m.name, dose: m.dose, times: m.times })),
      })),
    currentMedications: context.currentMedications
      .slice(0, 50)
      .map((m) => ({
        name: m.name,
        dose: m.dose,
        times: m.times,
        paused: m.paused,
      })),
    recentDoses: context.doseRecords
      .slice(0, 20)
      .map((d) => ({ name: d.name, dose: d.dose, date: d.date, time: d.time })),
  };
}
export function chatReply(value: unknown): ChatReply {
  if (!value || typeof value !== "object")
    throw new Error("답변을 읽지 못했어요.");
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.answer !== "string" ||
    !raw.answer.trim() ||
    raw.answer.length > 5000 ||
    !Array.isArray(raw.recordIds) ||
    !Array.isArray(raw.referenceIds) ||
    !Array.isArray(raw.followUps) ||
    typeof raw.urgent !== "boolean"
  )
    throw new Error("답변을 읽지 못했어요.");
  return {
    answer: raw.answer,
    recordIds: strings(raw.recordIds, 8),
    referenceIds: strings(raw.referenceIds, 3).filter((id) =>
      chatReferences.some((r) => r.id === id),
    ),
    followUps: strings(raw.followUps, 3),
    urgent: raw.urgent,
  };
}
