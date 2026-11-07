import type { AppState, DocumentRecord } from "./domain.ts";

export const documentMoment = (doc: { date: string; time?: string }) =>
  doc.date + (doc.time ? `T${doc.time}` : "");
export const compareDocuments = (
  a: Pick<DocumentRecord, "id" | "date">,
  b: Pick<DocumentRecord, "id" | "date">,
) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id);
export const documentDateLabel = (
  doc: Pick<DocumentRecord, "date" | "dateSource">,
) => `${doc.date}${doc.dateSource === "issued" ? " · 발급일 기준" : ""}`;

export function timelineEntries(state: AppState) {
  const documents = state.documents.map((doc) => ({
    id: `document:${doc.id}`,
    at: doc.date,
    sortAt: doc.date,
    dateOnly: true,
    type: "document" as const,
    title:
      doc.source === "manual"
        ? "직접 입력한 건강 기록"
        : doc.kind === "diagnosis"
          ? "진단서"
          : doc.kind === "prescription"
            ? "처방전"
            : "진료 기록",
    detail: `${doc.items.length}개의 약 · ${doc.source === "manual" ? "직접 선택한 기록 날짜 기준" : "서류에 적힌 진료일 기준"}`,
    documentId: doc.id,
  }));
  const localMoment = (at: string) => {
    const date = new Date(at);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
  };
  const actions = state.activities
    .filter((a) => a.type !== "document")
    .map((a) => ({
      ...a,
      sortAt: localMoment(a.at),
      dateOnly: false,
    }));
  const checks = Object.entries(state.checks).map(([key, at]) => {
    const [id, date, time] = key.split("|");
    return {
      id: key,
      at,
      sortAt: localMoment(at),
      dateOnly: false,
      type: "check" as const,
      title: `${state.doseSnapshots?.[key]?.name || state.medications.find((m) => m.id === id)?.name || "처방약"} 투약했어요`,
      detail: `${date} ${time} 일정`,
    };
  });
  return [...documents, ...actions, ...checks].sort(
    (a, b) => b.sortAt.localeCompare(a.sortAt) || a.id.localeCompare(b.id),
  );
}
