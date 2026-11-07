type Condition = {
  name: string;
  status: "diagnosed" | "suspected" | "resolved" | "history";
  note: string;
};
export type BriefContext = {
  pet: { name: string };
  records: {
    id: string;
    date: string;
    source?: "photo" | "manual";
    diagnosis: string;
    conditions: Condition[];
  }[];
  currentMedications: unknown[];
  doseRecords: unknown[];
};
const statusLabel = {
  diagnosed: "문서상 진단",
  suspected: "의심 소견",
  resolved: "호전·종료 기록",
  history: "과거 병력",
} as const;
export function groundedFacts(context: BriefContext) {
  const records = [...context.records].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
  const seen = new Set<string>();
  const conditions: {
    condition: Condition;
    record: (typeof records)[number];
  }[] = [];
  for (const record of records)
    for (const condition of record.source === "manual"
      ? []
      : record.conditions) {
      const key = condition.name
        .normalize("NFKC")
        .replace(/\s/g, "")
        .toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        conditions.push({ condition, record });
      }
    }
  const current = conditions.slice(0, 4).map(({ condition, record }) => ({
    text: `${condition.name}: ${statusLabel[condition.status]} (${record.date} 문서).${condition.note ? ` ${condition.note}` : ""}`,
    sourceIds: [record.id],
  }));
  if (!current.length && records[0]?.diagnosis)
    current.push({
      text: `${records[0].date} ${records[0].source === "manual" ? "보호자 직접 기록" : "진료 기록"}: ${records[0].diagnosis}`,
      sourceIds: [records[0].id],
    });
  const description = conditions.length
    ? conditions
        .slice(0, 3)
        .map(
          ({ condition }) =>
            `${condition.name}(${statusLabel[condition.status]})`,
        )
        .join(", ") +
      (conditions.length > 3 ? ` 외 ${conditions.length - 3}개` : "") +
      "이 기록되어 있어요."
    : records[0]?.diagnosis
      ? records[0].source === "manual"
        ? "보호자가 직접 남긴 건강 관찰과 메모를 보관하고 있어요."
        : "최근 진료 내용과 이전 처방을 함께 보관하고 있어요."
      : "현재 기록에는 확실한 진단명이 기재되어 있지 않아요.";
  return {
    summary: `${context.pet.name}의 건강 기록에는 ${description} 현재 유효한 처방약은 ${context.currentMedications.length}개이고, 최근 확인된 투약 체크는 ${context.doseRecords.length}건이에요.`,
    current,
  };
}
export function supportedWatch(
  item: {
    sourceIds: string[];
    referenceIds: string[];
    possibility: string;
    prepare: string;
    title?: string;
  },
  context: BriefContext,
): boolean {
  const sources = context.records.filter((r) => item.sourceIds.includes(r.id));
  if (!sources.length || sources.length !== new Set(item.sourceIds).size)
    return false;
  // A caregiver note can provide observations but cannot establish a disease.
  const clinicalSources = sources.filter(
    (record) => record.source !== "manual",
  );
  if (!clinicalSources.length) return false;
  const text = JSON.stringify(clinicalSources);
  const meds = JSON.stringify(context.currentMedications);
  if (/재발/.test((item.title || "") + item.possibility) && !/재발/.test(text))
    return false;
  for (const reference of item.referenceIds) {
    if (
      reference === "aaha-senior" &&
      new Set(clinicalSources.flatMap((r) => r.conditions.map((c) => c.name)))
        .size < 2 &&
      !/노령|senior|geriatric/i.test(text)
    )
      return false;
    if (reference === "iris-kidney" && !/신장|kidney|renal|CKD/i.test(text))
      return false;
    if (
      reference === "merck-heart" &&
      !/심장|승모판|심혈관|mitral|heart|cardiac/i.test(text)
    )
      return false;
    if (
      reference === "aaha-diabetes" &&
      (!/당뇨|diabetes/i.test(text) || !/인슐린|insulin/i.test(text + meds))
    )
      return false;
  }
  // A generated claim of recovery cannot be justified by a past-history label.
  if (
    /호전되|완치|회복되|안정적|정상 상태/.test(item.possibility) &&
    !/호전|완치|회복|안정|정상/.test(text)
  )
    return false;
  if (
    /(용량|복용량|투약량).{0,12}(늘리|줄이|증가|감소|변경하)|약.{0,10}(중단하세요|끊으세요)/.test(
      item.prepare,
    )
  )
    return false;
  return (
    item.possibility.trim().length >= 12 && item.prepare.trim().length >= 12
  );
}
export function groundedPreparation(item: {
  prepare: string;
  referenceIds: string[];
}): string {
  if (
    !/(검사|검진|치료|식단|영양제|운동).{0,25}(실시|받아야|시작|권장|필수|필요합니다)/.test(
      item.prepare,
    )
  )
    return item.prepare;
  if (item.referenceIds.includes("iris-kidney"))
    return "이전·최근 검사 결과와 현재 약 목록을 준비하고, 필요한 추적 관찰과 기존 재검 일정은 주치의와 확인해 주세요.";
  if (item.referenceIds.includes("merck-heart"))
    return "기침·호흡·활동에서 평소와 다른 점이 있으면 시작 시점을 기록해 진료 때 보여주세요. 새로 호흡이 힘들어지면 병원에 바로 연락해 주세요.";
  if (item.referenceIds.includes("aaha-diabetes"))
    return "현재 투약 기록을 준비하고, 혈당 관찰 계획은 주치의에게 확인해 주세요. 이 브리핑을 근거로 인슐린 용량을 임의로 바꾸지 마세요.";
  return "기존 질환과 모든 처방 목록을 함께 준비해 주세요. 새 검사나 관리 계획이 필요한지는 주치의와 확인해 주세요.";
}
