import { clinicalGuides } from "./clinical-guides.ts";
import { isClinicalConditionName, recordOverview } from "./clinical-records.ts";

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
    diagnosis: string;
    summary?: string;
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
const dermatophytosisName = /^(피부\s*사상균증|dermatophytosis|ringworm)$/i;
type WatchItem = {
  title: string;
  possibility: string;
  prepare: string;
  sourceIds: string[];
  referenceIds: string[];
};

function orderedRecords(context: BriefContext) {
  return [...context.records].sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
}

function dermatophytosisRecord(context: BriefContext) {
  for (const record of orderedRecords(context)) {
    const condition = record.conditions.find((c) =>
      dermatophytosisName.test(c.name.trim()),
    );
    if (condition) return { record, status: condition.status };
    // Legacy records may have a diagnosis without structured conditions.
    // Match only the diagnosis itself, not a mention in notes or a negation.
    if (dermatophytosisName.test(record.diagnosis.trim()))
      return { record, status: "diagnosed" as const };
  }
}

export function completeFollowUp(
  context: BriefContext,
  generated: { watch: WatchItem[]; questions: string[] },
) {
  const skin = dermatophytosisRecord(context);
  const questions = generated.questions.filter((q) => q.trim());
  let watch = generated.watch;
  if (skin) {
    const { record, status } = skin;
    const observation = {
      diagnosed:
        "피부사상균증 진단이 기록되어 있어요. 이후 경과는 기록 시점과 구분해 확인해야 하며, 탈모·각질·붉어짐 같은 피부 변화가 있다면 진료 경과를 살피는 단서가 될 수 있어요.",
      suspected:
        "피부사상균증 의심 소견이 기록되어 있어요. 현재 감염이 확진된 것으로 볼 수는 없으며, 탈모·각질·붉어짐 같은 피부 변화가 있다면 진료 때 함께 확인할 단서가 될 수 있어요.",
      history:
        "피부사상균증이 과거 병력으로 기록되어 있어요. 현재 감염 여부는 이 병력만으로 알 수 없으며, 이후 피부 변화가 있다면 이전 진료 기록과 함께 확인할 수 있어요.",
      resolved:
        "피부사상균증의 호전·종료 기록이 있어요. 이후 새로 피부 변화가 있다면 부위와 시점을 기록해 진료 때 확인할 수 있으며, 그 변화만으로 같은 감염이라고 단정할 수는 없어요.",
    }[status];
    // A verified guide-backed observation remains useful even when the model
    // omits it. Replace duplicate skin items so stale statuses cannot win.
    const skinWatch: WatchItem = {
      title: "피부사상균증 기록 이후의 피부 상태",
      possibility: `${record.date} 문서 기준으로, ${observation}`,
      prepare:
        "피부 변화가 있다면 부위·시작 시점과 사진을 남겨 주세요. 기존 진료·검사 기록을 함께 준비하고, 이후 경과와 기존 관리 계획을 주치의에게 확인해 주세요.",
      sourceIds: [record.id],
      referenceIds: ["merck-dermatophytosis"],
    };
    watch = [
      skinWatch,
      ...watch.filter((w) => !w.referenceIds.includes("merck-dermatophytosis")),
    ];
    questions.unshift(
      `${record.date} 문서의 피부사상균증(${statusLabel[status]}) 이후 경과와 현재 피부 상태는 어떻게 확인하면 될까요?`,
      "피부 상태와 기존 검사 결과를 함께 볼 때, 주치의가 정한 재진·관리 계획에서 확인할 점은 무엇인가요?",
    );
    if (status !== "resolved")
      questions.push(
        "현재 감염이 확인된다면, 함께 지내는 동물·사람과의 접촉 및 생활환경 관리에서 주의할 점은 무엇인가요?",
      );
  }
  if (!questions.length) {
    for (const record of orderedRecords(context)) {
      for (const condition of record.conditions) {
        if (!isClinicalConditionName(condition.name)) continue;
        questions.push(
          `${record.date} 문서의 ${condition.name}(${statusLabel[condition.status]})에 대해 현재 경과와 기존 재진 계획에서 확인할 점은 무엇인가요?`,
        );
      }
      if (
        !questions.length &&
        (record.diagnosis.trim() || record.summary?.trim())
      )
        questions.push(
          `${record.date} 문서에 적힌 진료 내용의 이후 경과와 기존 재진 계획에서 확인할 점은 무엇인가요?`,
        );
      if (questions.length) break;
    }
  }
  return {
    watch: watch.slice(0, 3),
    questions: [...new Set(questions)].slice(0, 3),
  };
}

export function groundedFacts(context: BriefContext) {
  const records = orderedRecords(context);
  const seen = new Set<string>();
  const conditions: {
    condition: Condition;
    record: (typeof records)[number];
  }[] = [];
  for (const record of records)
    for (const condition of record.conditions) {
      if (!isClinicalConditionName(condition.name)) continue;
      const key = condition.name
        .normalize("NFKC")
        .replace(/\s/g, "")
        .toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        conditions.push({ condition, record });
      }
    }
  const conditionFacts = conditions.map(({ condition, record }) => ({
    text: `${condition.name}: ${statusLabel[condition.status]} (${record.date} 문서).${condition.note ? ` ${condition.note}` : ""}`,
    sourceIds: [record.id],
  }));
  const current = records
    .flatMap((record) => {
      if (record.conditions.some((c) => isClinicalConditionName(c.name)))
        return conditionFacts.filter((fact) =>
          fact.sourceIds.includes(record.id),
        );
      return [
        {
          text: `${record.date} 기록: ${recordOverview(record)}`,
          sourceIds: [record.id],
        },
      ];
    })
    .slice(0, 8);
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
    : records[0]
      ? `${records[0].date} 진료 내용이 기록되어 있어요. ${recordOverview(records[0])}`
      : "아직 정리할 진료 기록이 없어요.";
  return {
    summary: `${context.pet.name}의 문서에는 ${description} 현재 유효한 처방약은 ${context.currentMedications.length}개이고, 최근 확인된 투약 체크는 ${context.doseRecords.length}건이에요.`,
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
  if (
    !item.referenceIds.length ||
    item.referenceIds.some((id) => !clinicalGuides.some((g) => g.id === id))
  )
    return false;
  const text = JSON.stringify(sources);
  const meds = JSON.stringify(context.currentMedications);
  if (/재발/.test((item.title || "") + item.possibility) && !/재발/.test(text))
    return false;
  for (const reference of item.referenceIds) {
    if (
      reference === "merck-dermatophytosis" &&
      !dermatophytosisRecord({ ...context, records: sources })
    )
      return false;
    if (
      reference === "aaha-senior" &&
      new Set(
        sources.flatMap((r) =>
          r.conditions
            .filter((c) => isClinicalConditionName(c.name))
            .map((c) => c.name),
        ),
      ).size < 2 &&
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
  if (item.referenceIds.includes("merck-dermatophytosis"))
    return "피부 변화가 있다면 부위·시작 시점과 사진을 남기고, 기존 진료·검사 기록과 관리 계획을 주치의에게 확인해 주세요.";
  return "기존 질환과 모든 처방 목록을 함께 준비해 주세요. 새 검사나 관리 계획이 필요한지는 주치의와 확인해 주세요.";
}
