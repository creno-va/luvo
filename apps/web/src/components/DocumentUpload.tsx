import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  CircleHelp,
  ChevronDown,
  Dog,
  FilePlus2,
  FileText,
  ImagePlus,
  LoaderCircle,
  Pill,
  Plus,
  RotateCcw,
  ShieldCheck,
  Upload,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";
import {
  isDate,
  isTime,
  uid,
  validateItems,
  type AppState,
  type DocumentRecord,
  type Extraction,
  type PrescriptionItem,
} from "@/lib/domain";
import { fingerprint } from "@/lib/storage";
import { analysisViews } from "@/lib/image";
import { resolvePatient } from "@/lib/household";
import { preparePrescriptionReview } from "@/lib/prescription-review";
export type Draft = {
  extraction: Extraction;
  file: File;
  fingerprint: string;
  manual: boolean;
  targetPetId?: string;
  documentKind?: "prescription" | "diagnosis";
};
const blankItem = (): PrescriptionItem => ({
  name: "",
  dose: "",
  times: [],
  startDate: "",
  endDate: "",
  instructions: "",
  action: "prescribe",
});
export function DocumentUpload({
  open,
  onOpenChange,
  state,
  pets,
  saving,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  state: AppState;
  pets: AppState[];
  saving: boolean;
  onSaved: (draft: Draft, document: DocumentRecord) => Promise<{ ok: boolean }>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [step, setStep] = useState<"pick" | "analyzing" | "review">("pick");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [files, setFiles] = useState<{ prescription?: File; diagnosis?: File }>(
    {},
  );
  const [slot, setSlot] = useState<"prescription" | "diagnosis">(
    "prescription",
  );
  const queue = useRef<{ file: File; kind: "prescription" | "diagnosis" }[]>(
    [],
  );
  const kind = useRef<"prescription" | "diagnosis">("prescription");
  const operation = useRef(0);
  const [completed, setCompleted] = useState(0);
  useEffect(() => {
    if (!open) {
      operation.current++;
      request.current?.abort();
      setStep("pick");
      setDraft(null);
      setError("");
      setFiles({});
      setCompleted(0);
      queue.current = [];
    }
  }, [open]);
  useEffect(() => {
    if (!draft) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(draft.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [draft]);
  useEffect(() => () => request.current?.abort(), []);

  async function nextFile() {
    const next = queue.current.shift();
    if (!next) {
      onOpenChange(false);
      return;
    }
    kind.current = next.kind;
    setDraft(null);
    await receive(next.file);
  }
  function stage(file?: File) {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 12 * 1024 * 1024
    ) {
      setError("JPG, PNG, WebP · 12MB 이하의 사진을 골라 주세요.");
      return;
    }
    setFiles((current) => ({ ...current, [slot]: file }));
    setError("");
  }
  async function start() {
    if (
      files.prescription &&
      files.diagnosis &&
      (await fingerprint(files.prescription)) ===
        (await fingerprint(files.diagnosis))
    ) {
      setError("같은 사진은 한 곳에만 넣어 주세요.");
      return;
    }
    queue.current = (["prescription", "diagnosis"] as const).flatMap((key) =>
      files[key] ? [{ file: files[key]!, kind: key }] : [],
    );
    await nextFile();
  }
  async function receive(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("JPG, PNG, WebP 사진을 올려주세요.");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("12MB 이하의 사진을 골라 주세요.");
      return;
    }
    const id = ++operation.current;
    setError("");
    setUploadName(file.name);
    setStep("analyzing");
    let hash = "";
    try {
      hash = await fingerprint(file);
      if (id !== operation.current) return;
      if (pets.some((p) => p.documents.some((d) => d.fingerprint === hash))) {
        setError("이미 등록한 문서예요. 진료 기록에서 확인해 주세요.");
        setStep("pick");
        return;
      }
      const views = await analysisViews(file);
      if (id !== operation.current) return;
      const form = new FormData();
      for (const view of views) {
        const field = view.region === "full" ? "image" : view.region;
        form.append(
          field,
          view.blob,
          `${view.region}.${view.blob.type === "image/png" ? "png" : "jpg"}`,
        );
      }
      form.append("documentKind", kind.current);
      request.current = new AbortController();
      const timeout = window.setTimeout(() => request.current?.abort(), 70_000);
      let response: Response;
      try {
        response = await fetch("/api/prescriptions/analyze", {
          method: "POST",
          body: form,
          signal: request.current.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }
      const data = await response.json();
      if (id !== operation.current) return;
      if (!response.ok) throw new Error(data.error || "사진을 읽지 못했어요.");
      const extraction = data as Extraction;
      extraction.medications = (extraction.medications || []).map(preparePrescriptionReview);
      const next: Draft = {
        extraction,
        file,
        fingerprint: hash,
        manual: false,
        documentKind: extraction.documentKind || kind.current,
      };
      if (!extraction.medications?.length) {
        next.extraction.medications = [];
        if (kind.current === "prescription")
          next.extraction.warnings = [
            ...(extraction.warnings ?? []),
            "약이 없는 처방전이에요. 진료 내용을 확인해 주세요.",
          ];
      }
      const route = resolvePatient(
        pets.filter((p) => !p.sample),
        extraction.animal,
      );
      if (route.kind === "review") extraction.warnings.push(route.reason);
      setDraft(next);
      setStep("review");
    } catch (cause) {
      if (id !== operation.current) return;
      setDraft({
        extraction: {
          clinic: "",
          date: "",
          time: "",
          diagnosis: "",
          summary: "",
          medications: [],
          quality: "unreadable",
          warnings: [],
          animal: { name: "", breed: "", sex: "", age: "", birthDate: "" },
          conditions: [],
        },
        file,
        fingerprint: hash || (await fingerprint(file)),
        manual: true,
        documentKind: kind.current,
      });
      setError(
        cause instanceof Error && cause.name !== "AbortError"
          ? `${cause.message} 사진은 직접 입력해 기록할 수 있어요.`
          : "분석이 오래 걸리고 있어요. 직접 입력하거나 다시 시도해 주세요.",
      );
      setStep("review");
    }
  }
  function makeDocument(value: Draft): DocumentRecord {
    return {
      id: uid(),
      fingerprint: value.fingerprint,
      filename: value.file.name,
      clinic: value.extraction.clinic.trim(),
      date: value.extraction.date,
      time: value.extraction.time || "",
      diagnosis: value.extraction.diagnosis,
      summary: [
        value.manual ? "" : value.extraction.summary,
        value.extraction.dateSource === "issued"
          ? "서류 기준일은 발급일이며 실제 진료일은 미확인"
          : "",
        value.extraction.animal.weight
          ? `문서상 체중: ${value.extraction.animal.weight}`
          : "",
        value.extraction.onsetDate
          ? `발병일: ${value.extraction.onsetDate}`
          : "",
        value.extraction.prognosis
          ? `예후 소견: ${value.extraction.prognosis}`
          : "",
        value.extraction.otherFindings
          ? `그 밖의 사항: ${value.extraction.otherFindings}`
          : "",
      ]
        .filter(Boolean)
        .join("\n")
        .slice(0, 3000),
      items: value.extraction.medications,
      animal: value.extraction.animal,
      conditions: value.extraction.conditions.filter((c) => c.name.trim()),
      createdAt: new Date().toISOString(),
      kind: value.documentKind,
      dateSource: value.extraction.dateSource,
      issuedDate: value.extraction.issuedDate,
      onsetDate: value.extraction.onsetDate,
      prognosis: value.extraction.prognosis,
      otherFindings: value.extraction.otherFindings,
    };
  }
  function updateExtraction(change: Partial<Extraction>) {
    setDraft((d) =>
      d ? { ...d, extraction: { ...d.extraction, ...change } } : d,
    );
  }
  function updateItem(index: number, change: Partial<PrescriptionItem>) {
    setDraft((current) => current ? ({ ...current, extraction: { ...current.extraction, medications: current.extraction.medications.map((item,i)=>i===index ? preparePrescriptionReview({ ...item, ...change, ...(Object.hasOwn(change,"endDate") ? {endDateDerived:false} : {}) }) : item) } }) : current);
  }
  function updateMedicationTime(index:number, timeIndex:number, value:string) {
    setDraft((current) => current ? ({ ...current, extraction: { ...current.extraction, medications: current.extraction.medications.map((item,i)=>i===index ? { ...item, times: item.times.map((time,j)=>j===timeIndex ? value : time) } : item) } }) : current);
  }
  async function save() {
    if (!draft) return;
    const route = draft.targetPetId
      ? null
      : resolvePatient(
          pets.filter((p) => !p.sample),
          draft.extraction.animal,
        );
    if (route?.kind === "review") {
      setError(route.reason);
      return;
    }
    const issue = validateItems(draft.extraction.medications);
    if (
      issue ||
      !isDate(draft.extraction.date) ||
      (draft.extraction.time && !isTime(draft.extraction.time))
    ) {
      setError(issue || "서류에 적힌 진료 날짜·시간을 확인해 주세요.");
      return;
    }
    setError("");
    const result = await onSaved(draft, makeDocument(draft));
    if (result.ok) {
      setCompleted((n) => n + 1);
      await nextFile();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
    >
      <DialogContent
        variant="sheet"
        className={cn("upload-dialog", step === "review" && "review-dialog")}
      >
        <div className="modal-icon">
          <FilePlus2 size={25} />
        </div>
        <DialogTitle className="modal-title">
          {step === "pick"
            ? "병원에 다녀왔나요?"
            : step === "analyzing"
              ? "진료 기록을 읽고 있어요"
              : draft?.manual
                ? "사진을 보며 기록해 주세요"
                : "읽은 내용을 확인해 주세요"}
        </DialogTitle>
        <DialogDescription className="modal-description">
          {step === "pick"
            ? "받아온 문서를 넣어주세요. 한 장만 있어도 괜찮아요."
            : step === "analyzing"
              ? "문서에 적힌 내용을 차근차근 확인하고 있어요."
              : draft?.manual
                ? "자동 분석을 완료하지 못했어요. 직접 입력한 내용으로 저장돼요."
                : "사진에서 읽은 값을 채웠어요. 확인한 뒤 저장해 주세요."}
        </DialogDescription>
        {completed > 0 && (
          <p className="batch-progress" role="status">
            {completed}장 저장 완료 · 남은 문서를 이어서 확인해요.
          </p>
        )}
        {step === "pick" && (
          <>
            {state.sample && (
              <p className="sample-upload-note">
                사진을 등록하면 샘플을 비우고 내 기록으로 시작해요.
              </p>
            )}
            <div className="document-slots">
              {(["prescription", "diagnosis"] as const).map((key) => (
                <div
                  className={cn("document-slot", files[key] && "has-file")}
                  key={key}
                >
                  <div className="slot-heading">
                    <FileText size={21} />
                    <strong>
                      {key === "prescription" ? "처방전" : "진단서"}
                    </strong>
                    <span>선택</span>
                  </div>
                  {files[key] ? (
                    <div className="slot-file">
                      <FileThumbnail file={files[key]!} />
                      <span>{files[key]!.name}</span>
                      <button
                        aria-label={`${key === "prescription" ? "처방전" : "진단서"} 사진 제거`}
                        onClick={() =>
                          setFiles((current) => ({
                            ...current,
                            [key]: undefined,
                          }))
                        }
                      >
                        <X size={18} />
                      </button>
                    </div>
                  ) : (
                    <p>
                      {key === "prescription"
                        ? "약 이름·용량·먹일 시간을 읽어요"
                        : "강아지 정보와 진료 내용을 읽어요"}
                    </p>
                  )}
                  <div className="slot-actions">
                    <button
                      onClick={() => {
                        setSlot(key);
                        fileInput.current?.click();
                      }}
                    >
                      <ImagePlus size={17} />
                      사진 {files[key] ? "바꾸기" : "선택"}
                    </button>
                    <button
                      onClick={() => {
                        setSlot(key);
                        cameraInput.current?.click();
                      }}
                      aria-label={`${key === "prescription" ? "처방전" : "진단서"} 촬영`}
                    >
                      <Camera size={17} />
                      촬영
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <input
              className="sr-only"
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="문서 사진 선택"
              onChange={(e) => {
                stage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <input
              className="sr-only"
              ref={cameraInput}
              type="file"
              capture="environment"
              accept="image/jpeg,image/png,image/webp"
              aria-label="진료 문서 촬영"
              onChange={(e) => {
                stage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <p className="upload-format">JPG · PNG · WebP / 장당 최대 12MB</p>
            <p className="upload-disclosure">
              사진·병력·투약 기록을 Cloudflare AI로 분석해요.
              <br />
              원본과 결과는 이 브라우저에 저장돼요.
            </p>
            <Button
              size="lg"
              className="upload-start"
              disabled={!files.prescription && !files.diagnosis}
              onClick={() => void start()}
            >
              기록 정리하기{" "}
              <span>
                {Number(!!files.prescription) + Number(!!files.diagnosis)}장
              </span>
              <Upload size={18} />
            </Button>
            <div className="upload-guide">
              <ShieldCheck size={17} />
              <p>
                문서에 없는 약이나 용량을 새로 결정하지 않아요.
                <br />
                읽은 값을 필드에 채운 뒤, 확인받고 저장해요.
              </p>
            </div>
          </>
        )}
        {step === "analyzing" && (
          <div className="analysis-state">
            <div className="analysis-spinner">
              <FileText size={37} />
              <LoaderCircle className="spin-ring" />
            </div>
            <strong>사진 속 기록을 정리하는 중이에요</strong>
            <p>{uploadName}</p>
            <span>조금만 기다려 주세요. 최대 1분 정도 걸릴 수 있어요.</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              나중에 다시 할게요
            </Button>
          </div>
        )}
        {step === "review" && draft && (
          <>
            <div
              className={`ocr-result-banner quality-${draft.extraction.quality || "filled"}`}
              role="status"
            >
              <FileText size={18} />
              <div>
                <strong>
                  {draft.extraction.quality === "blank"
                    ? "기입된 값이 없는 양식이에요"
                    : draft.extraction.quality === "partial"
                      ? "일부만 확인된 문서예요"
                      : draft.manual
                        ? "직접 확인할 수 있게 준비했어요"
                        : "문서에서 읽은 값을 채웠어요"}
                </strong>
                <p>
                  {draft.extraction.quality === "blank"
                    ? "인쇄된 항목명은 값으로 채우지 않았어요. 기입된 서류를 다시 올리거나 직접 입력해 주세요."
                    : "원본과 비교하고, 빈칸이나 잘못 읽은 항목을 수정해 주세요. 아직 저장되지 않았어요."}
                </p>
              </div>
            </div>
            {preview && (
              <details className="ocr-compare">
                <summary>
                  사진 원본과 비교하기 <ImagePlus size={16} />
                </summary>
                <a href={preview} target="_blank" rel="noreferrer">
                  <img src={preview} alt="인식한 진료 문서 원본" />
                </a>
              </details>
            )}
            <div className="patient-review">
              <h3>
                <Dog size={17} />
                문서에서 읽은 강아지 정보
              </h3>
              <div className="review-fields">
                <label>
                  강아지 이름
                  <Input
                    value={draft.extraction.animal.name}
                    onChange={(e) =>
                      updateExtraction({
                        animal: {
                          ...draft.extraction.animal,
                          name: e.target.value,
                        },
                      })
                    }
                    placeholder="보호자 이름이 아닌 강아지 이름"
                    maxLength={80}
                  />
                </label>
                <label>
                  품종
                  <Input
                    value={draft.extraction.animal.breed}
                    onChange={(e) =>
                      updateExtraction({
                        animal: {
                          ...draft.extraction.animal,
                          breed: e.target.value,
                        },
                      })
                    }
                    placeholder="문서에 없으면 비워두세요"
                    maxLength={80}
                  />
                </label>
              </div>
              <div className="review-fields">
                <label>
                  성별
                  <Input
                    value={draft.extraction.animal.sex}
                    onChange={(e) =>
                      updateExtraction({
                        animal: {
                          ...draft.extraction.animal,
                          sex: e.target.value,
                        },
                      })
                    }
                    placeholder="수컷 / 암컷"
                    maxLength={30}
                  />
                </label>
                <label>
                  문서상 나이
                  <Input
                    value={draft.extraction.animal.age}
                    onChange={(e) =>
                      updateExtraction({
                        animal: {
                          ...draft.extraction.animal,
                          age: e.target.value,
                        },
                      })
                    }
                    placeholder="예: 7세"
                    maxLength={60}
                  />
                </label>
              </div>
              <div className="review-fields">
                <label>
                  동물 종류
                  <Input
                    value={draft.extraction.animal.species || ""}
                    onChange={(e) =>
                      updateExtraction({
                        animal: {
                          ...draft.extraction.animal,
                          species: e.target.value,
                        },
                      })
                    }
                    placeholder="예: 개 · 품종과 구분해요"
                    maxLength={40}
                  />
                </label>
                <label>
                  체중
                  <Input
                    value={draft.extraction.animal.weight || ""}
                    onChange={(e) =>
                      updateExtraction({
                        animal: {
                          ...draft.extraction.animal,
                          weight: e.target.value,
                        },
                      })
                    }
                    placeholder="예: 4.2 kg · 기재된 경우만"
                    maxLength={40}
                  />
                </label>
              </div>
              <label className="field-label">강아지 생년월일 · 문서에 기재된 경우만<Input type="date" value={draft.extraction.animal.birthDate} onChange={(e)=>updateExtraction({animal:{...draft.extraction.animal,birthDate:e.target.value}})}/></label>
              {pets.filter((p) => !p.sample).length > 0 && (
                <label className="field-label">
                  이 기록을 연결할 강아지
                  <select
                    className="patient-target"
                    value={draft.targetPetId || "auto"}
                    onChange={(e) =>
                      setDraft((d) =>
                        d
                          ? {
                              ...d,
                              targetPetId:
                                e.target.value === "auto"
                                  ? undefined
                                  : e.target.value,
                            }
                          : d,
                      )
                    }
                  >
                    <option value="auto">문서 정보로 자동 연결</option>
                    {pets
                      .filter((p) => !p.sample)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.profile.name} · {p.profile.detail}
                        </option>
                      ))}
                    <option value="new">새 강아지로 등록</option>
                  </select>
                </label>
              )}
            </div>
            <div className="review-source">
              {preview && <img src={preview} alt="업로드한 처방전" />}
              <div>
                <strong>{draft.file.name}</strong>
                <span>{draft.manual ? "직접 입력" : "AI가 읽은 문서"}</span>
              </div>
              <button
                onClick={() => {
                  setStep("pick");
                  setDraft(null);
                  setError("");
                }}
                aria-label="다른 사진 선택"
              >
                <RotateCcw size={17} />
              </button>
            </div>
            {draft.extraction.warnings.length > 0 && (
              <div className="review-warnings">
                {draft.extraction.warnings.map((warning, i) => (
                  <p key={i}>
                    <CircleHelp size={15} />
                    {warning}
                  </p>
                ))}
              </div>
            )}
            <div className="review-fields">
              <label>
                병원 이름
                <Input
                  value={draft.extraction.clinic}
                  onChange={(e) => updateExtraction({ clinic: e.target.value })}
                  placeholder="병원 이름 · 선택"
                  maxLength={80}
                />
              </label>
              <label>
                서류 기준일 · 진단/처방일 또는 발급일
                <Input
                  type="date"
                  value={draft.extraction.date}
                  onChange={(e) => updateExtraction({ date: e.target.value })}
                />
              </label>
              <label>
                서류에 적힌 진료 시간 · 선택
                <Input
                  type="time"
                  value={draft.extraction.time || ""}
                  onChange={(e) => updateExtraction({ time: e.target.value })}
                />
                <small>시간이 없으면 비워두세요. 날짜만 기록해요.</small>
              </label>
            </div>
            <label className="field-label">
              병명·진단 내용 <span>선택</span>
              <textarea
                className="ocr-textarea"
                value={draft.extraction.diagnosis}
                onChange={(e) =>
                  updateExtraction({ diagnosis: e.target.value })
                }
                placeholder="문서에 적힌 내용을 남겨주세요"
              />
            </label>
            <details
              className="ocr-clinical-details"
              open={draft.documentKind === "diagnosis" ? true : undefined}
            >
              <summary>
                진단서 상세 항목 <Plus size={16} />
              </summary>
              <div className="review-fields">
                <label>
                  발병 연월일
                  <Input
                    type="date"
                    value={draft.extraction.onsetDate || ""}
                    onChange={(e) =>
                      updateExtraction({ onsetDate: e.target.value })
                    }
                  />
                </label>
                <label>
                  서류 발급일
                  <Input
                    type="date"
                    value={draft.extraction.issuedDate || ""}
                    onChange={(e) =>
                      updateExtraction({ issuedDate: e.target.value })
                    }
                  />
                </label>
              </div>
              <label className="field-label">
                예후 소견
                <textarea
                  className="ocr-textarea"
                  value={draft.extraction.prognosis || ""}
                  onChange={(e) =>
                    updateExtraction({ prognosis: e.target.value })
                  }
                  placeholder="진단서에 기재된 예후"
                  maxLength={1000}
                />
              </label>
              <label className="field-label">
                그 밖의 사항
                <textarea
                  className="ocr-textarea"
                  value={draft.extraction.otherFindings || ""}
                  onChange={(e) =>
                    updateExtraction({ otherFindings: e.target.value })
                  }
                  placeholder="문서에 적힌 기타 소견"
                  maxLength={1500}
                />
              </label>
            </details>
            {draft.extraction.conditions.length > 0 && (
              <div className="ocr-conditions">
                <h3>기록할 병력</h3>
                {draft.extraction.conditions.map((condition, index) => (
                  <div className="ocr-condition" key={index}>
                    <Input
                      aria-label={`병력 ${index + 1} 이름`}
                      value={condition.name}
                      onChange={(e) =>
                        updateExtraction({
                          conditions: draft.extraction.conditions.map((c, i) =>
                            i === index ? { ...c, name: e.target.value } : c,
                          ),
                        })
                      }
                    />
                    <select
                      aria-label={`병력 ${index + 1} 상태`}
                      value={condition.status}
                      onChange={(e) =>
                        updateExtraction({
                          conditions: draft.extraction.conditions.map((c, i) =>
                            i === index
                              ? {
                                  ...c,
                                  status: e.target.value as typeof c.status,
                                }
                              : c,
                          ),
                        })
                      }
                    >
                      <option value="diagnosed">문서상 진단</option>
                      <option value="suspected">의심 소견</option>
                      <option value="history">과거 병력</option>
                      <option value="resolved">호전·종료 기록</option>
                    </select>
                    <button
                      aria-label={`병력 ${index + 1} 제거`}
                      onClick={() =>
                        updateExtraction({
                          conditions: draft.extraction.conditions.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {draft.extraction.medications.map((item, i) => (
              <div className="review-medication" key={i}>
                <div className="review-med-heading">
                  <span>
                    <Pill size={17} />약 {i + 1}
                  </span>
                  {draft.extraction.medications.length > 0 && (
                    <button
                      onClick={() =>
                        updateExtraction({
                          medications: draft.extraction.medications.filter(
                            (_, j) => j !== i,
                          ),
                        })
                      }
                      aria-label={`약 ${i + 1} 삭제`}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="review-fields">
                  <label>
                    약 이름
                    <Input
                      value={item.name}
                      onChange={(e) => updateItem(i, { name: e.target.value })}
                      placeholder="처방전에 적힌 약 이름"
                      maxLength={100}
                    />
                  </label>
                  <label>
                    1회 용량
                    <Input
                      value={item.dose}
                      onChange={(e) => updateItem(i, { dose: e.target.value })}
                      placeholder="예: 1회 1정"
                      maxLength={60}
                    />
                  </label>
                </div>
                <details
                  className="ocr-med-details"
                  open={
                    !!(
                      item.ingredient ||
                      item.productName ||
                      item.frequency ||
                      item.durationDays ||
                      item.totalQuantity
                    )
                  }
                >
                  <summary>
                    처방전 원문 항목 <ChevronDown size={15} />
                  </summary>
                  <div className="review-fields">
                    {(
                      [
                        ["ingredient", "성분명"],
                        ["productName", "권장 제품명"],
                        ["frequency", "용법·하루 횟수"],
                        ["durationDays", "처방일수(투약일수)"],
                        ["totalQuantity", "판매 수량(포장 단위)"],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field}>
                        {label}
                        <Input
                          value={item[field] || ""}
                          onChange={(e) =>
                            updateItem(i, { [field]: e.target.value })
                          }
                          placeholder="미기재"
                          maxLength={100}
                        />
                      </label>
                    ))}
                  </div>
                </details>
                <label className="field-label">문서상 처방 상태<select className="patient-target" value={item.action} onChange={(e)=>updateItem(i,{action:e.target.value as "prescribe" | "stop"})}><option value="prescribe">처방 · 복용 일정 등록</option><option value="stop">문서에 중단 명시</option></select></label>
                <div className="review-fields">
                  <label>
                    적용 시작일
                    <Input
                      type="date"
                      value={item.startDate}
                      onChange={(e) =>
                        updateItem(i, { startDate: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    종료일 <span>{item.endDateDerived ? "처방일수로 계산 · 확인 필요" : "선택"}</span>
                    <Input
                      type="date"
                      value={item.endDate}
                      onChange={(e) =>
                        updateItem(i, { endDate: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="field-label">실제로 먹일 시간</label>
                {!item.times.length && (
                  <p className="ocr-time-note">
                    {item.frequency ? `원문: ${item.frequency}. ` : ""}횟수만
                    적힌 경우 시각은 비워두었어요. 실제 먹일 시간을 추가해
                    주세요.
                  </p>
                )}
                <div className="time-inputs">
                  {item.times.map((time, j) => (
                    <div key={j}>
                      <Input
                        type="time"
                        value={time}
                        aria-label={`약 ${i + 1} 투약 시간 ${j + 1}`}
                        onInput={(e)=>updateMedicationTime(i,j,e.currentTarget.value)}
                        onChange={(e)=>updateMedicationTime(i,j,e.target.value)}
                      />
                      <button
                        onClick={() =>
                          updateItem(i, {
                            times: item.times.filter((_, k) => k !== j),
                          })
                        }
                        aria-label={`약 ${i + 1} 시간 ${j + 1} 삭제`}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      updateItem(i, { times: [...item.times, ""] })
                    }
                  >
                    <Plus size={15} />
                    시간
                  </Button>
                </div>
                <label className="field-label">
                  복용 안내 <span>선택</span>
                  <Input
                    value={item.instructions}
                    onChange={(e) =>
                      updateItem(i, { instructions: e.target.value })
                    }
                    placeholder="예: 식후 복용"
                    maxLength={200}
                  />
                </label>
              </div>
            ))}
            <Button
              variant="ghost"
              className="self-start"
              size="sm"
              onClick={() =>
                updateExtraction({
                  medications: [...draft.extraction.medications, blankItem()],
                })
              }
            >
              <Plus size={16} />약 추가하기
            </Button>
            <Button
              className="review-save"
              size="lg"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Check size={18} />
              )}
              {queue.current.length
                ? "확인하고 다음 문서 보기"
                : "확인하고 기록하기"}
            </Button>
          </>
        )}
        {error && (
          <p className="inline-error" role="alert">
            <CircleHelp size={16} />
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function FileThumbnail({ file }: { file: File }) {
  const [source, setSource] = useState("");
  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return source ? (
    <img src={source} alt="선택한 문서 사진" />
  ) : (
    <ImagePlus size={24} />
  );
}
