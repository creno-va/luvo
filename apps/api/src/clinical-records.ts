type RecordContent = {
  diagnosis: string;
  summary?: string;
  conditions: { name: string; note: string }[];
};

const key = (value: string) =>
  value
    .normalize("NFKC")
    .replace(/[\s:：.,·()（）_-]/g, "")
    .toLowerCase();

// These describe a visit or a normal finding, not a named illness. Keep the
// original text in the record overview instead of assigning a disease status.
export function isClinicalConditionName(name: string): boolean {
  const value = key(name);
  return (
    !!value &&
    !/^(?:출생(?:당일)?|신생[자아]|건강|정기|일반|정상)?검진(?:정상|양호)?$/.test(
      value,
    ) &&
    !/^(?:없음|해당없음|미기재|병명|진단명|과거병력|병력|기왕력|unknown|n\/?a|null|undefined|정상|양호|정상출생|양호하게출생|출생(?:기록|검진)?|출생당일(?:검진)?|신생[자아]검진|건강검진|정기검진)$/.test(
      value,
    ) &&
    !/^(?:신생[자아]|출생당일|건강|정기)?(?:검진(?:상)?)?(?:임상적)?(?:특이(?:소견|사항)|이상(?:소견|징후)|병력|기왕력|질환|질병|병명|진단명?)(?:이|은|는)?(?:없음|없다|없습니다|해당없음)$/.test(
      value,
    )
  );
}

const hasContent = (value: string) =>
  !!value.trim() &&
  !/^(?:과거병력|병력|병명|진단명|미기재|없음|해당없음|unknown|n\/?a|null|undefined)$/.test(
    key(value),
  ) &&
  !!key(value);

export function recordOverview(record: RecordContent): string {
  const findings = record.conditions.filter(
    (c) => !isClinicalConditionName(c.name),
  );
  const content = [
    record.diagnosis,
    record.summary || "",
    ...findings.flatMap((c) => [c.name, c.note]),
  ].filter(hasContent);
  const text = content.join(" ");
  // Only condense explicit birth-exam findings. A missing diagnosis alone is
  // never evidence of a healthy birth or the absence of disease.
  if (
    !isClinicalConditionName(record.diagnosis) &&
    [record.diagnosis, ...findings.map((c) => c.name)].some((value) =>
      /출생|신생[자아]/.test(value),
    ) &&
    /출생|신생[자아]/.test(text) &&
    /(?:특이|이상)\s*소견(?:이)?\s*없(?:음|다|습니다)/.test(text)
  )
    return /활력\s*양호|검진\s*(?:시|상)?\s*양호|양호하게\s*출생/.test(text)
      ? "출생 검진 양호 · 특이 소견 없음."
      : "출생 검진에서 특이 소견 없음.";
  const overview = (
    isClinicalConditionName(record.diagnosis)
      ? [record.diagnosis, record.summary || "", ...content]
      : [record.summary || "", record.diagnosis, ...content]
  ).find(hasContent);
  if (!overview)
    return "문서에 병명이나 상세 진료 내용이 기재되어 있지 않아요.";
  return overview.length > 180
    ? `${overview.slice(0, 179).trimEnd()}…`
    : overview.trim();
}
