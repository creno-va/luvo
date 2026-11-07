import {
  localDate,
  uid,
  type AppState,
  type DocumentRecord,
  type Extraction,
} from "./domain.ts";

export type RecordDraft = {
  extraction: Extraction;
  file?: File;
  fingerprint: string;
  manual: boolean;
  targetPetId?: string;
  documentKind?: DocumentRecord["kind"];
};

export function manualDraft(pet?: AppState, date = localDate()): RecordDraft {
  const patient = pet && !pet.sample ? pet : undefined;
  return {
    manual: true,
    fingerprint: `manual:${uid()}`,
    documentKind: "note",
    targetPetId: patient && !patient.sample ? patient.id : "new",
    extraction: {
      date,
      diagnosis: "",
      summary: "",
      animal: {
        name: patient?.profile.name || "",
        breed: patient?.profile.breed || "",
        sex: patient?.profile.sex || "",
        age: patient?.profile.age || "",
        weight: patient?.profile.weight,
      },
      medications: [],
      conditions: [],
      warnings: [],
    },
  };
}

export function draftDocument(draft: RecordDraft): DocumentRecord {
  return {
    id: uid(),
    fingerprint: draft.fingerprint,
    filename: draft.file?.name || "",
    source: draft.file ? "photo" : "manual",
    kind: draft.documentKind,
    date: draft.extraction.date,
    dateSource: draft.extraction.dateSource,
    diagnosis: draft.extraction.diagnosis.trim(),
    summary: draft.manual ? "" : draft.extraction.summary,
    items: draft.extraction.medications,
    animal: draft.extraction.animal,
    conditions: draft.extraction.conditions.filter((c) => c.name.trim()),
    createdAt: new Date().toISOString(),
  };
}
