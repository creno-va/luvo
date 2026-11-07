import {
  emptyState,
  animalFields,
  documentFields,
  prescriptionFields,
  applyPrescription,
  localDate,
  isPrescribed,
  revisionAt,
  type AppState,
  type AnimalInfo,
  type DocumentRecord,
} from "./domain.ts";
import { compareDocuments } from "./chronology.ts";

export type Household = {
  version: 3;
  activePetId: string | null;
  pets: AppState[];
};
export const emptyHousehold = (): Household => ({
  version: 3,
  activePetId: null,
  pets: [],
});
export function activePet(store: Household): AppState | undefined {
  return store.pets.find((p) => p.id === store.activePetId) ?? store.pets[0];
}
export function migrateStore(value: unknown): Household {
  if (!value) return emptyHousehold();
  const stored = value as {
    version: number;
    pets?: AppState[];
    activePetId?: string | null;
  } & Partial<Omit<AppState, "version">>;
  if (
    (stored.version === 2 || stored.version === 3) &&
    Array.isArray(stored.pets)
  )
    return {
      version: 3,
      activePetId: stored.activePetId || null,
      pets: stored.pets.map(restoreClinicalDates),
    };
  if (stored.version === 1 && Array.isArray(stored.documents)) {
    if (
      !stored.documents.length &&
      !stored.medications?.length &&
      stored.profile?.name === "우리 아이"
    )
      return emptyHousehold();
    const pet = {
      ...emptyState(),
      ...stored,
      version: 1 as const,
      id: stored.id || crypto.randomUUID(),
      revision: stored.revision ?? 0,
    } as AppState;
    return {
      version: 3,
      activePetId: pet.id,
      pets: [restoreClinicalDates(pet)],
    };
  }
  throw new Error(
    "저장된 기록 형식을 확인하지 못했어요. 기존 기록은 지우지 않았어요.",
  );
}
function restoreClinicalDates(pet: AppState): AppState {
  const profile = animalFields({
    name: pet.profile.name,
    breed: pet.profile.breed || "",
    sex: pet.profile.sex || "",
    age: pet.profile.age || "",
    weight: pet.profile.weight,
  });
  return {
    ...pet,
    profile: {
      ...profile,
      detail: pet.profile.detail,
      asOf: pet.profile.asOf,
      asOfTime: pet.profile.asOfTime,
    },
    documents: pet.documents.map(documentFields),
    medications: pet.medications.map((med) => ({
      ...med,
      revisions: med.revisions.map((revision) => {
        const doc = pet.documents.find((d) => d.id === revision.documentId) as
          (DocumentRecord & { time?: string }) | undefined;
        return {
          ...prescriptionFields(revision),
          documentId: revision.documentId,
          recordedAt: revision.recordedAt,
          documentDate: doc?.date || revision.documentDate,
          documentTime: revision.documentTime || doc?.time || "",
          startDate: revision.startDate,
          endDate: revision.endDate || "",
          action: revision.action || "prescribe",
        };
      }),
    })),
  };
}
const normalize = (value: string) =>
  value.normalize("NFKC").replace(/\s/g, "").toLocaleLowerCase();
export function resolvePatient(
  pets: AppState[],
  animal: AnimalInfo,
):
  | { kind: "existing"; id: string }
  | { kind: "new" }
  | { kind: "review"; reason: string } {
  if (!animal.name.trim())
    return { kind: "review", reason: "문서의 강아지 이름을 확인해 주세요." };
  const matches = pets.filter(
    (p) => normalize(p.profile.name) === normalize(animal.name),
  );
  if (!matches.length) return { kind: "new" };
  const compatible = matches.filter(
    (p) =>
      !(["breed", "sex"] as const).some(
        (key) =>
          p.profile[key] &&
          animal[key] &&
          normalize(p.profile[key]!) !== normalize(animal[key]),
      ),
  );
  if (matches.length === 1 && compatible.length === 1)
    return { kind: "existing", id: compatible[0].id };
  return {
    kind: "review",
    reason:
      "이름이 같거나 기본 정보가 달라요. 어느 강아지의 기록인지 골라 주세요.",
  };
}
export function ingestDocument(
  store: Household,
  doc: DocumentRecord,
  target?: string,
): Household {
  if (
    store.pets.some((p) =>
      p.documents.some((d) => d.fingerprint === doc.fingerprint),
    )
  )
    throw new Error(
      "이미 등록한 문서예요. 해당 강아지의 진료 기록을 확인해 주세요.",
    );
  const realPets = store.pets.filter((p) => !p.sample);
  if (target === "new" && !doc.animal?.name.trim())
    throw new Error("등록할 강아지 이름을 확인해 주세요.");
  const resolution =
    target && target !== "new"
      ? { kind: "existing" as const, id: target }
      : target === "new"
        ? { kind: "new" as const }
        : resolvePatient(
            realPets,
            doc.animal ?? {
              name: "",
              breed: "",
              sex: "",
              age: "",
            },
          );
  if (resolution.kind === "review") throw new Error(resolution.reason);
  const existing =
    resolution.kind === "existing"
      ? realPets.find((p) => p.id === resolution.id)
      : undefined;
  if (resolution.kind === "existing" && !existing)
    throw new Error(
      "선택한 강아지의 기록을 찾을 수 없어요. 다시 선택해 주세요.",
    );
  const pet = applyPrescription(existing ?? emptyState(), doc);
  return {
    version: 3,
    activePetId: pet.id,
    pets: existing
      ? realPets.map((p) => (p.id === pet.id ? pet : p))
      : [...realPets, pet],
  };
}
export function replacePet(
  store: Household,
  id: string,
  update: (pet: AppState) => AppState,
): Household {
  if (!store.pets.some((p) => p.id === id))
    throw new Error("강아지를 먼저 등록해 주세요.");
  return {
    ...store,
    pets: store.pets.map((p) => (p.id === id ? update(p) : p)),
  };
}
export function briefingContext(pet: AppState, date = localDate()) {
  const documents = pet.documents.toSorted(compareDocuments);
  return {
    analysisVersion: 7,
    pet: {
      name: pet.profile.name,
      breed: pet.profile.breed || "",
      sex: pet.profile.sex || "",
      age: pet.profile.age || "",
      profileAsOf: pet.profile.asOf || "",
    },
    asOf: date,
    records: documents.map((d) => ({
      id: d.id,
      date: d.date,
      diagnosis: d.diagnosis,
      summary: d.summary,
      conditions: d.conditions ?? [],
      medications: d.items,
    })),
    currentMedications: pet.medications
      .filter((m) => isPrescribed(m, date))
      .map((m) => ({
        id: m.id,
        ...prescriptionFields(revisionAt(m, date)!),
        name: m.name,
        paused: m.pauses.some((p) => !p.end),
        pauseHistory: m.pauses,
      })),
    doseRecords: Object.entries(pet.checks)
      .toSorted(([, a], [, b]) => b.localeCompare(a))
      .slice(0, 60)
      .map(([key, at]) => {
        const [medicationId, date, time] = key.split("|");
        const snapshot = pet.doseSnapshots?.[key];
        return {
          key,
          at,
          medicationId: medicationId || "",
          name:
            snapshot?.name ||
            pet.medications.find((m) => m.id === medicationId)?.name ||
            "",
          dose: snapshot?.dose || "",
          date: date || "",
          time: time || "",
          sourceId: snapshot?.documentId || "",
        };
      }),
    uncheckedMeaning:
      "미체크는 미확인이다. 미복용이나 정상 상태의 증거가 아니다.",
  };
}
export async function contextHash(context: unknown): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(context)),
  );
  return Array.from(new Uint8Array(digest), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
