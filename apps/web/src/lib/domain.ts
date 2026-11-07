import { documentMoment } from "./chronology.ts";

export type PrescriptionItem = {
  ingredient?: string;
  productName?: string;
  frequency?: string;
  durationDays?: string;
  endDateDerived?: boolean;
  totalQuantity?: string;
  name: string;
  dose: string;
  times: string[];
  startDate: string;
  endDate: string;
  instructions: string;
  action: "prescribe" | "stop";
};
export type Medication = {
  id: string;
  name: string;
  revisions: (PrescriptionItem & {
    documentId: string;
    recordedAt: string;
    documentDate?: string;
    documentTime?: string;
  })[];
  pauses: { id: string; start: string; end: string | null }[];
};
export type DocumentRecord = {
  id: string;
  fingerprint: string;
  filename: string;
  kind?: "prescription" | "diagnosis";
  dateSource?: "clinical" | "issued" | "unknown";
  issuedDate?: string;
  onsetDate?: string;
  prognosis?: string;
  otherFindings?: string;
  date: string;
  time?: string;
  clinic: string;
  diagnosis: string;
  summary: string;
  createdAt: string;
  items: PrescriptionItem[];
  sample?: boolean;
  animal?: AnimalInfo;
  conditions?: ConditionEntry[];
};
export type AnimalInfo = {
  species?: string;
  weight?: string;
  name: string;
  breed: string;
  sex: string;
  age: string;
  birthDate: string;
};
export type ConditionEntry = {
  name: string;
  status: "diagnosed" | "suspected" | "resolved" | "history";
  note: string;
};
export type HealthBriefing = {
  summary: string;
  current: { text: string; sourceIds: string[] }[];
  watch: {
    title: string;
    possibility: string;
    prepare: string;
    sourceIds: string[];
    referenceIds: string[];
  }[];
  questions: string[];
  unknowns: string[];
  contextHash: string;
  generatedAt: string;
  references: { id: string; title: string; url: string }[];
};
export type Activity = {
  id: string;
  at: string;
  type: "document" | "pause" | "resume";
  title: string;
  detail: string;
  documentId?: string;
};
export type AppState = {
  version: 1;
  id: string;
  revision: number;
  profile: {
    name: string;
    detail: string;
    species?: string;
    weight?: string;
    breed?: string;
    sex?: string;
    age?: string;
    birthDate?: string;
    asOf?: string;
    asOfTime?: string;
  };
  medications: Medication[];
  documents: DocumentRecord[];
  checks: Record<string, string>;
  doseSnapshots?: Record<
    string,
    {
      name: string;
      dose: string;
      documentId: string;
      date: string;
      time: string;
    }
  >;
  activities: Activity[];
  sample: boolean;
  briefing?: HealthBriefing;
  briefingError?: string;
  analysisConsent?: boolean;
};
export type Extraction = {
  documentKind?: "prescription" | "diagnosis";
  quality?: "filled" | "blank" | "partial" | "unreadable";
  dateSource?: "clinical" | "issued" | "unknown";
  issuedDate?: string;
  onsetDate?: string;
  prognosis?: string;
  otherFindings?: string;
  clinic: string;
  date: string;
  time?: string;
  diagnosis: string;
  summary: string;
  medications: PrescriptionItem[];
  warnings: string[];
  animal: AnimalInfo;
  conditions: ConditionEntry[];
};

export const emptyState = (): AppState => ({
  version: 1,
  id: uid(),
  revision: 0,
  profile: { name: "우리 아이", detail: "함께 쌓아가는 건강 기록" },
  medications: [],
  documents: [],
  checks: {},
  activities: [],
  sample: false,
});
export const uid = () => crypto.randomUUID();
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export const doseKey = (medId: string, date: string, time: string) =>
  `${medId}|${date}|${time}`;
export function isDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T12:00:00`);
  return !Number.isNaN(d.getTime()) && localDate(d) === value;
}
export const isTime = (value: string) =>
  /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function revisionAt(med: Medication, date: string) {
  return med.revisions
    .toReversed()
    .filter((r) => r.startDate <= date)
    .toSorted(
      (a, b) =>
        b.startDate.localeCompare(a.startDate) ||
        documentMoment({
          date: b.documentDate || b.startDate,
          time: b.documentTime,
        }).localeCompare(
          documentMoment({
            date: a.documentDate || a.startDate,
            time: a.documentTime,
          }),
        ) ||
        a.documentId.localeCompare(b.documentId),
    )[0];
}
export function isPrescribed(med: Medication, date: string): boolean {
  const r = revisionAt(med, date);
  return !!r && r.action !== "stop" && (!r.endDate || date <= r.endDate);
}
export function pausedAt(med: Medication, at: string): boolean {
  const time = new Date(at).getTime();
  return med.pauses.some(
    (p) =>
      new Date(p.start).getTime() <= time &&
      (!p.end || time < new Date(p.end).getTime()),
  );
}
export function toggleMedication(
  state: AppState,
  id: string,
  at = new Date().toISOString(),
): AppState {
  const med = state.medications.find((m) => m.id === id);
  if (!med) return state;
  const open = med.pauses.find((p) => p.end === null);
  const updated = {
    ...med,
    pauses: open
      ? med.pauses.map((p) => (p.id === open.id ? { ...p, end: at } : p))
      : [...med.pauses, { id: uid(), start: at, end: null }],
  };
  return {
    ...state,
    revision: state.revision + 1,
    medications: state.medications.map((m) => (m.id === id ? updated : m)),
    activities: [
      {
        id: uid(),
        at,
        type: open ? "resume" : "pause",
        title: `${med.name} ${open ? "다시 복용해요" : "복용을 쉬어요"}`,
        detail: open
          ? "미복용 기간을 기록했어요"
          : "다시 켤 때까지 미복용 기간으로 남겨요",
      },
      ...state.activities,
    ],
  };
}
export function toggleCheck(
  state: AppState,
  key: string,
  now = new Date().toISOString(),
): AppState {
  const checks = { ...state.checks };
  const doseSnapshots = { ...state.doseSnapshots };
  if (checks[key]) {
    delete checks[key];
    delete doseSnapshots[key];
  } else {
    checks[key] = now;
    const [id, date, time] = key.split("|");
    const med = state.medications.find((m) => m.id === id);
    const plan = med && date ? revisionAt(med, date) : undefined;
    if (med && plan)
      doseSnapshots[key] = {
        name: med.name,
        dose: plan.dose,
        documentId: plan.documentId,
        date,
        time,
      };
  }
  return { ...state, checks, doseSnapshots, revision: state.revision + 1 };
}
export function scheduleFor(state: AppState, date: string) {
  const rows = state.medications.flatMap((med) => {
    const r = revisionAt(med, date);
    if (!r || !isPrescribed(med, date)) return [];
    return r.times.map((time) => {
      const key = doseKey(med.id, date, time);
      const paused = pausedAt(
        med,
        new Date(`${date}T${time}:00`).toISOString(),
      );
      return {
        key,
        med,
        revision:
          state.checks[key] && state.doseSnapshots?.[key]
            ? { ...r, dose: state.doseSnapshots[key].dose }
            : r,
        time,
        checkedAt: state.checks[key],
        paused,
      };
    });
  });
  // A later prescription can remove a time slot, but never a completed dose.
  for (const [key, snapshot] of Object.entries(state.doseSnapshots ?? {})) {
    if (
      snapshot.date !== date ||
      !state.checks[key] ||
      rows.some((r) => r.key === key)
    )
      continue;
    const med = state.medications.find((m) => m.id === key.split("|")[0]);
    const revision = med?.revisions.find(
      (r) => r.documentId === snapshot.documentId,
    );
    if (med && revision)
      rows.push({
        key,
        med,
        revision: { ...revision, dose: snapshot.dose },
        time: snapshot.time,
        checkedAt: state.checks[key],
        paused: false,
      });
  }
  return rows.sort(
    (a, b) =>
      a.time.localeCompare(b.time) || a.med.name.localeCompare(b.med.name),
  );
}
export function validateItems(items: PrescriptionItem[]): string | null {
  if (
    new Set(items.map((item) => normalizedName(item.name))).size !==
    items.length
  )
    return "같은 이름의 약이 여러 번 있어요. 하나로 합치거나 이름을 구분해 주세요.";
  for (const item of items) {
    if (!item.name.trim()) return "약 이름을 확인해 주세요.";
    if (!isDate(item.startDate)) return "적용 날짜를 확인해 주세요.";
    if (
      item.endDate &&
      (!isDate(item.endDate) || item.endDate < item.startDate)
    )
      return "종료일은 시작일 이후로 정해 주세요.";
    if (
      item.action !== "stop" &&
      (!item.dose.trim() ||
        !item.times.length ||
        item.times.some((t) => !isTime(t)))
    )
      return "용량과 투약 시간을 확인해 주세요.";
  }
  return null;
}
const normalizedName = (name: string) =>
  name.normalize("NFKC").replace(/\s/g, "").toLocaleLowerCase();
export function applyPrescription(
  state: AppState,
  doc: DocumentRecord,
): AppState {
  if (state.documents.some((d) => d.fingerprint === doc.fingerprint))
    throw new Error("이미 등록한 문서예요. 진료 기록에서 확인할 수 있어요.");
  const error = validateItems(doc.items);
  if (error) throw new Error(error);
  if (!isDate(doc.date))
    throw new Error("서류에 적힌 진료 날짜를 확인해 주세요.");
  if (doc.time && !isTime(doc.time))
    throw new Error("서류에 적힌 진료 시간을 확인해 주세요.");
  if (!doc.items.length && !doc.diagnosis.trim() && !doc.animal?.name)
    throw new Error("약이 없는 진단서는 진료 내용을 입력해 주세요.");
  const medications = structuredClone(state.medications);
  for (const item of doc.items) {
    const existing = medications.find(
      (m) => normalizedName(m.name) === normalizedName(item.name),
    );
    const revision = {
      ...item,
      name: item.name.trim(),
      times: [...new Set(item.times)].sort(),
      documentId: doc.id,
      recordedAt: doc.createdAt,
      documentDate: doc.date,
      documentTime: doc.time || "",
    };
    if (existing) existing.revisions.push(revision);
    else
      medications.push({
        id: uid(),
        name: item.name.trim(),
        revisions: [revision],
        pauses: [],
      });
  }
  return {
    ...state,
    revision: state.revision + 1,
    profile:
      doc.animal &&
      (!state.profile.asOf ||
        documentMoment(doc) >
          documentMoment({
            date: state.profile.asOf,
            time: state.profile.asOfTime,
          }))
        ? {
            ...state.profile,
            ...Object.fromEntries(
              Object.entries(doc.animal).filter(([, value]) => value.trim()),
            ),
            asOf: doc.date,
            asOfTime: doc.time || "",
            detail: profileDetail({
              ...state.profile,
              ...Object.fromEntries(
                Object.entries(doc.animal).filter(([, value]) => value.trim()),
              ),
            }),
          }
        : state.profile,
    medications,
    documents: [doc, ...state.documents],
    activities: [
      {
        id: uid(),
        at: documentMoment(doc),
        type: "document",
        title: `${doc.clinic || "병원"} 진료 기록을 추가했어요`,
        detail: `${doc.items.length}개의 약 · ${doc.date}`,
        documentId: doc.id,
      },
      ...state.activities,
    ],
  };
}
export function profileDetail(profile: AppState["profile"]): string {
  return (
    [profile.breed, profile.sex, profile.age].filter(Boolean).join(" · ") ||
    "문서에서 건강 기록을 이어가요"
  );
}
export function sampleState(now = new Date()): AppState {
  const date = localDate(now);
  const createdAt = now.toISOString();
  const state = emptyState();
  const items: PrescriptionItem[] = [
    {
      name: "관절 관리 처방약",
      dose: "1회 1정",
      times: ["08:00", "20:00"],
      startDate: shiftDate(date, -3),
      endDate: shiftDate(date, 10),
      instructions: "식후에 먹여 주세요",
      action: "prescribe",
    },
    {
      name: "피부 관리 처방약",
      dose: "1회 반 정",
      times: ["08:00"],
      startDate: shiftDate(date, -3),
      endDate: shiftDate(date, 3),
      instructions: "처방된 용량을 지켜 주세요",
      action: "prescribe",
    },
  ];
  const result = applyPrescription(state, {
    id: uid(),
    fingerprint: "luvo-sample-v1",
    filename: "샘플 처방전",
    clinic: "루보 동물병원",
    date: shiftDate(date, -3),
    diagnosis: "사용 흐름을 살펴보기 위한 가상의 기록이에요.",
    summary: "기존 처방이 오늘 투약 일정으로 연결돼요.",
    createdAt,
    items,
    sample: true,
  });
  result.profile = { name: "두부", detail: "말티푸 · 5살" };
  result.sample = true;
  return result;
}
