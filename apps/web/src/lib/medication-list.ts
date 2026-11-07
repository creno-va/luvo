import {
  isPrescribed,
  revisionAt,
  scheduleFor,
  type AppState,
} from "./domain.ts";

export function medicationList(
  pet: AppState,
  date: string,
  todayOnly: boolean,
) {
  const rows = scheduleFor(pet, date);
  const medications = pet.medications.filter(
    (m) =>
      !todayOnly ||
      isPrescribed(m, date) ||
      rows.some((r) => r.med.id === m.id && r.checkedAt),
  );
  return {
    rows,
    medications: medications
      .map((med) => {
        const prescribed = isPrescribed(med, date);
        const plan =
          revisionAt(med, date) ??
          med.revisions.toSorted(
            (a, b) =>
              a.startDate.localeCompare(b.startDate) ||
              a.documentId.localeCompare(b.documentId),
          )[0];
        const status = prescribed
          ? med.pauses.some((p) => !p.end)
            ? "복용 중단"
            : "복용 중"
          : plan?.startDate > date
            ? "시작 전"
            : plan?.action === "stop"
              ? "중단 기록"
              : "처방 기간 종료";
        return { med, plan, prescribed, status };
      })
      .filter((item) => !!item.plan),
  };
}
