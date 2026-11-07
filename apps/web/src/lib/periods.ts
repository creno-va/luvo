import type { AppState } from "./domain.ts";
import { compareDocuments } from "./chronology.ts";
export type HealthPeriod = {
  id: string;
  type: "condition" | "medication";
  name: string;
  start: string;
  end: string;
  label: string;
  note: string;
};
export function healthPeriods(pet: AppState): HealthPeriod[] {
  const conditions = new Map<
    string,
    { name: string; start: string; end: string; latestStatus: string }
  >();
  for (const doc of [...pet.documents].sort(
    (a, b) => -compareDocuments(a, b),
  )) {
    for (const condition of doc.conditions ?? []) {
      const key = condition.name
        .normalize("NFKC")
        .replace(/\s/g, "")
        .toLowerCase();
      const previous = conditions.get(key);
      conditions.set(key, {
        name: condition.name,
        start: previous?.start || doc.date,
        end: condition.status === "resolved" ? doc.date : "",
        latestStatus: condition.status,
      });
    }
  }
  const result: HealthPeriod[] = [...conditions.entries()].map(([key, c]) => ({
    id: `condition:${key}`,
    type: "condition",
    name: c.name,
    start: c.start,
    end: c.end,
    label:
      c.latestStatus === "history"
        ? "과거 병력 · 발병·종료 시점 미확인"
        : c.latestStatus === "suspected"
          ? "의심 소견 · 확진되지 않은 기록"
          : c.end
            ? "문서상 호전·종료 기록까지"
            : "최초 확인 기록부터 · 종료 미확인",
    note: "실제 발병일이 아닌, 문서에서 처음 확인된 날짜예요.",
  }));
  for (const med of pet.medications) {
    const revisions = [...med.revisions].sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        (a.documentDate || a.startDate).localeCompare(
          b.documentDate || b.startDate,
        ) ||
        (a.documentTime || "").localeCompare(b.documentTime || ""),
    );
    revisions.forEach((revision, index) => {
      if (revision.action === "stop") return;
      const next = revisions[index + 1];
      const end =
        next && (!revision.endDate || next.startDate < revision.endDate)
          ? next.startDate
          : revision.endDate;
      const pauses = med.pauses.filter(
        (pause) =>
          (!pause.end || pause.end.slice(0, 10) >= revision.startDate) &&
          (!end || pause.start.slice(0, 10) <= end),
      );
      result.push({
        id: `medication:${med.id}:${index}`,
        type: "medication",
        name: med.name,
        start: revision.startDate,
        end,
        label: `${revision.dose} · ${revision.times.join(" / ")}`,
        note: [
          next
            ? "다음 처방으로 변경된 날까지 표시해요."
            : "처방에 적힌 기간이에요. 실제 복용 여부와는 달라요.",
          ...pauses.map(
            (p) =>
              `복용 쉼 ${p.start.slice(0, 10)} — ${p.end?.slice(0, 10) || "현재"}`,
          ),
        ].join(" "),
      });
    });
  }
  return result.sort(
    (a, b) => b.start.localeCompare(a.start) || a.id.localeCompare(b.id),
  );
}
