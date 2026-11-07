import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Dog,
  FileText,
  Heart,
  LoaderCircle,
  Pill,
  Plus,
  RefreshCw,
  ShieldCheck,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Switch } from "./ui/switch";
import { Checkbox } from "./ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./ui/dialog";
import { DocumentUpload, type Draft } from "./DocumentUpload";
import { DocumentOnboarding } from "./DocumentOnboarding";
import { useHealthAnalysis } from "./HealthBriefing";
import { MedicationResearch } from "./MedicationResearch";
import {
  emptyState,
  isPrescribed,
  localDate,
  revisionAt,
  sampleState,
  scheduleFor,
  toggleCheck,
  toggleMedication,
  type AppState,
  type DocumentRecord,
  type HealthBriefing,
} from "@/lib/domain";
import {
  activePet,
  briefingContext,
  ingestDocument,
  replacePet,
  type Household,
} from "@/lib/household";
import { readFile, readState, writeState } from "@/lib/storage";
import { documentDateLabel, timelineEntries } from "@/lib/chronology";
import { healthPeriods } from "@/lib/periods";

type View = "home" | "dogs" | "timeline" | "welcome" | "medication";
const viewFromUrl = (): View => {
  const v = new URLSearchParams(location.search).get("view");
  return v === "dogs" ||
    v === "timeline" ||
    v === "welcome" ||
    v === "medication"
    ? v
    : "home";
};
const researchTarget = () => {
  const query = new URLSearchParams(location.search);
  return { petId: query.get("pet"), medId: query.get("med") };
};
const readableDate = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
const clock = (at: string) =>
  new Date(at).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function LuvoApp() {
  const [store, setStore] = useState<Household | null>(null);
  const [fatal, setFatal] = useState("");
  const [view, setView] = useState<View>(viewFromUrl);
  const [research, setResearch] = useState(researchTarget);
  const [date, setDate] = useState(localDate());
  const [calendar, setCalendar] = useState(false);
  const [upload, setUpload] = useState(false);
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [toast, setToast] = useState("");
  const [saving, setSaving] = useState(false);
  const [undo, setUndo] = useState<{
    before: Household;
    documentId: string;
  } | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const channel = useRef<BroadcastChannel | null>(null);
  const pet = store ? (activePet(store) ?? null) : null;
  const empty = useRef(emptyState()).current;
  const analysis = useHealthAnalysis(pet, commitBriefing);
  useEffect(() => {
    const load = () =>
      readState()
        .then((s) => {
          setStore(s);
        })
        .catch(() =>
          setFatal(
            "브라우저 저장소를 열지 못했어요. 기존 기록은 지우지 않았어요.",
          ),
        );
    void load();
    const onPop = () => {
      setView(viewFromUrl());
      setResearch(researchTarget());
    };
    window.addEventListener("popstate", onPop);
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("luvo-records");
      channel.current.onmessage = () => {
        setUndo(null);
        void load();
      };
    }
    return () => {
      window.removeEventListener("popstate", onPop);
      channel.current?.close();
    };
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [view, pet?.id]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  function navigate(next: View, medId?: string) {
    const url = new URL(location.href);
    if (next === "home") url.searchParams.delete("view");
    else url.searchParams.set("view", next);
    if (next === "medication" && medId && pet) {
      url.searchParams.set("med", medId);
      url.searchParams.set("pet", pet.id);
    } else {
      url.searchParams.delete("med");
      url.searchParams.delete("pet");
    }
    history.pushState({ luvoPage: true }, "", url);
    setResearch(researchTarget());
    setView(next);
  }
  function back() {
    if (history.state?.luvoPage) history.back();
    else navigate("home");
  }
  async function persist(
    change: (s: Household) => Household,
    file?: { id: string; blob: Blob },
    removeFileId?: string,
    preserveUndo = false,
  ): Promise<boolean> {
    let success = false;
    const task = async () => {
      setSaving(true);
      try {
        const write = async () => {
          const current = await readState();
          const next = change(current);
          if (next !== current) {
            await writeState(next, file, false, removeFileId);
            setStore(next);
            channel.current?.postMessage("updated");
          }
          if (!preserveUndo) setUndo(null);
        };
        if (navigator.locks) await navigator.locks.request("luvo-save", write);
        else await write();
        success = true;
      } catch (cause) {
        setToast(
          cause instanceof Error ? cause.message : "기록을 저장하지 못했어요.",
        );
      } finally {
        setSaving(false);
      }
    };
    const pending = queue.current.then(task, task);
    queue.current = pending;
    await pending;
    return success;
  }
  async function mutate(change: (s: AppState) => AppState) {
    if (!pet) return false;
    return persist((s) => replacePet(s, pet.id, change));
  }
  async function commitBriefing(
    id: string,
    signature: string,
    briefing?: HealthBriefing,
    error?: string,
  ) {
    const asOf = JSON.parse(signature).asOf;
    return persist(
      (s) => {
        const p = s.pets.find((item) => item.id === id);
        if (
          !p?.analysisConsent ||
          JSON.stringify(briefingContext(p, asOf)) !== signature
        )
          return s;
        return replacePet(s, id, (current) => ({
          ...current,
          ...(briefing ? { briefing } : {}),
          briefingError: error || "",
        }));
      },
      undefined,
      undefined,
      true,
    );
  }
  async function saveDocument(draft: Draft, doc: DocumentRecord) {
    let previous: Household | undefined;
    const ok = await persist(
      (s) => {
        previous = s;
        const next = ingestDocument(s, doc, draft.targetPetId);
        return replacePet(next, next.activePetId!, (p) => ({
          ...p,
          analysisConsent: true,
        }));
      },
      { id: doc.id, blob: draft.file },
    );
    if (ok) {
      if (previous) setUndo({ before: previous, documentId: doc.id });
      navigate("home");
      setToast(`${doc.animal?.name || "우리 아이"}의 진료 기록을 정리했어요.`);
    }
    return { ok };
  }
  async function installSample() {
    const sample = sampleState();
    if (
      await persist((s) =>
        s.pets.length
          ? s
          : { version: 3, activePetId: sample.id, pets: [sample] },
      )
    ) {
      navigate("home");
      setToast("가상의 샘플이에요. 투약 체크를 직접 해보세요.");
    }
  }
  if (fatal)
    return (
      <main className="boot-screen">
        <ShieldCheck size={32} />
        <h1>기록을 열지 못했어요</h1>
        <p>{fatal}</p>
        <Button onClick={() => location.reload()}>다시 열기</Button>
      </main>
    );
  if (!store)
    return (
      <main className="boot-screen">
        <LoaderCircle className="animate-spin" />
        <p>우리 아이의 기록을 준비하고 있어요</p>
      </main>
    );
  if (view === "medication") {
    const owner = store.pets.find((p) => p.id === research.petId);
    const med = owner?.medications.find((m) => m.id === research.medId);
    const plan = med && (revisionAt(med, date) ?? med.revisions.at(-1));
    return (
      <div className="care-app">
        {plan ? (
          <MedicationResearch
            key={`${owner!.id}:${med!.id}`}
            medication={plan}
            onBack={back}
          />
        ) : (
          <main className="boot-screen">
            <Pill size={30} />
            <h1>이 약의 기록을 찾지 못했어요</h1>
            <Button onClick={() => navigate("home")}>
              내 기록으로 돌아가기
            </Button>
          </main>
        )}
      </div>
    );
  }
  return (
    <div className="care-app">
      {!pet || view === "welcome" ? (
        <DocumentOnboarding
          onUpload={() => setUpload(true)}
          onSample={() => void installSample()}
        />
      ) : (
        <>
          <div className="desktop-masthead">
            <a className="wordmark" href="/">
              luvo<span>•</span>
            </a>
            <span>작은 기록으로, 오래 함께.</span>
            <span className="local-indicator">
              <i />이 브라우저에 저장 중
            </span>
          </div>
          <main className={`care-shell view-${view}`}>
            {view === "home" ? (
              <>
                <header className="care-header">
                  <button
                    className="date-trigger"
                    onClick={() => setCalendar(true)}
                    aria-label={`날짜 선택, ${readableDate(date)}`}
                  >
                    <span className="eyebrow">
                      {date === localDate() ? "TODAY" : "CARE LOG"}{" "}
                      <ChevronDown size={13} />
                    </span>
                    <strong>
                      {new Date(`${date}T12:00:00`).toLocaleDateString(
                        "ko-KR",
                        { month: "long", day: "numeric" },
                      )}
                      <em>
                        {new Date(`${date}T12:00:00`).toLocaleDateString(
                          "ko-KR",
                          { weekday: "short" },
                        )}
                      </em>
                    </strong>
                  </button>
                  <button
                    className="dog-trigger"
                    onClick={() => navigate("dogs")}
                    aria-label={`강아지 선택, ${pet.profile.name}`}
                  >
                    <span className="dog-avatar">
                      <Dog size={21} />
                    </span>
                    <span>{pet.profile.name}</span>
                    <ChevronDown size={16} />
                  </button>
                </header>
                {date !== localDate() && (
                  <p className="past-date-note">
                    투약은 선택한 날짜, 브리핑은 최신 기록 기준으로 보여드려요.
                  </p>
                )}
                {pet.sample && (
                  <div className="sample-notice">
                    <Sparkles size={14} />
                    <span>샘플 기록이에요. 자유롭게 눌러보세요.</span>
                    <button onClick={() => setUpload(true)}>
                      내 기록 시작 <ArrowUpRight size={14} />
                    </button>
                  </div>
                )}
                <div className="home-grid">
                  <div className="brief-column">
                    <Briefing
                      pet={pet}
                      analysis={analysis}
                      onDocument={setDocument}
                      onEnable={() =>
                        void mutate((p) => ({ ...p, analysisConsent: true }))
                      }
                    />
                  </div>
                  <div className="daily-column">
                    <MedicationList
                      pet={pet}
                      date={date}
                      saving={saving}
                      onResearch={(id) => navigate("medication", id)}
                      onToggle={async (id) => {
                        if (await mutate((p) => toggleMedication(p, id)))
                          setToast("복용 여부와 쉰 기간을 기록했어요.");
                      }}
                      onCheck={async (key) => {
                        if (await mutate((p) => toggleCheck(p, key)))
                          setToast(
                            pet.checks[key]
                              ? "투약 체크를 취소했어요."
                              : "먹인 약을 기록했어요. 잘 챙겨주셨어요.",
                          );
                      }}
                    />
                    <section className="recent-section">
                      <div className="section-top">
                        <div>
                          <span className="eyebrow">CARE TIMELINE</span>
                          <h2>차곡차곡, 건강 기록</h2>
                        </div>
                        <button
                          className="text-action"
                          onClick={() => navigate("timeline")}
                        >
                          전체보기 <ArrowUpRight size={16} />
                        </button>
                      </div>
                      <Timeline pet={pet} limit={3} onDocument={setDocument} />
                    </section>
                  </div>
                </div>
                <footer className="care-footer">
                  <span className="wordmark">
                    luvo<span>•</span>
                  </span>
                  <span>오늘의 작은 기록이, 내일의 안심이 되도록.</span>
                  <small>로그인 없이 · 이 브라우저에 저장</small>
                </footer>
              </>
            ) : view === "dogs" ? (
              <>
                <PageHeader
                  title="함께하는 우리 아이들"
                  eyebrow="MY COMPANIONS"
                  back={back}
                />
                <p className="page-intro">
                  아이를 선택하면 그 아이의 기록으로 이동해요.
                </p>
                <div className="dog-list">
                  {store.pets.map((p, index) => (
                    <button
                      className={`dog-profile ${pet.id === p.id ? "selected" : ""}`}
                      key={p.id}
                      onClick={async () => {
                        if (await persist((s) => ({ ...s, activePetId: p.id })))
                          navigate("home");
                      }}
                    >
                      <span className={`dog-portrait portrait-${index % 3}`}>
                        <Dog size={38} />
                        <i>{String(index + 1).padStart(2, "0")}</i>
                      </span>
                      <div>
                        <h2>{p.profile.name}</h2>
                        <p>{p.profile.detail}</p>
                        <small>
                          진료 기록 {p.documents.length}개 · 현재 처방{" "}
                          {
                            p.medications.filter((m) =>
                              isPrescribed(m, localDate()),
                            ).length
                          }
                          개
                        </small>
                      </div>
                      {pet.id === p.id ? (
                        <span className="selected-dog">
                          <Check size={18} />
                          <small>선택 중</small>
                        </span>
                      ) : (
                        <ArrowUpRight size={22} />
                      )}
                    </button>
                  ))}
                </div>
                <button
                  className="add-dog-card"
                  onClick={() => setUpload(true)}
                >
                  <span>
                    <Plus size={24} />
                  </span>
                  <div>
                    <strong>새로운 가족의 기록 시작하기</strong>
                    <p>진단서나 처방전 사진으로 등록해요.</p>
                  </div>
                  <ArrowUpRight size={21} />
                </button>
                <p className="storage-note">
                  <ShieldCheck size={16} />
                  원본과 기록은 이 브라우저에 보관해요.
                  <br />
                  브라우저 데이터를 지우면 기록도 사라져요.
                </p>
              </>
            ) : (
              <>
                <PageHeader
                  title={`${pet.profile.name}의 건강 타임라인`}
                  eyebrow="A LITTLE EVERY DAY"
                  back={back}
                />
                <p className="page-intro">
                  서류에 적힌 진료 날짜와 시간으로 이어지는 기록.
                </p>
                <HealthPeriods pet={pet} />
                <div className="section-top timeline-heading">
                  <h2>
                    모든 기록{" "}
                    <span className="count-label">
                      {timelineEntries(pet).length}
                    </span>
                  </h2>
                  <span className="muted-label">최근 기록부터</span>
                </div>
                <Timeline pet={pet} onDocument={setDocument} />
                <p className="timeline-note">
                  병력 기간은 문서에 확인된 기록 범위예요. 시간이나 종료가 없는
                  경우 임의로 추정하지 않아요.
                </p>
              </>
            )}
          </main>
          <div className="upload-dock">
            <div>
              <span>
                <FileText size={20} />
                <strong>병원 기록, 잊기 전에.</strong>
                <small>사진 한 장으로 이어가요</small>
              </span>
              <button
                className="primary-action"
                onClick={() => setUpload(true)}
              >
                <Plus size={21} />
                <span>처방전 / 진단서 업로드</span>
                <ArrowUpRight size={20} />
              </button>
            </div>
          </div>
        </>
      )}
      <DocumentUpload
        open={upload}
        onOpenChange={setUpload}
        state={pet ?? empty}
        pets={store.pets}
        saving={saving}
        onSaved={saveDocument}
      />
      <CalendarSheet
        open={calendar}
        onOpenChange={setCalendar}
        value={date}
        pet={pet}
        onSelect={(d) => {
          setDate(d);
          setCalendar(false);
        }}
      />
      <DocumentSheet document={document} onClose={() => setDocument(null)} />
      {undo && !upload && (
        <div className="undo-strip">
          <span>진료 기록을 추가했어요</span>
          <button
            onClick={async () => {
              const entry = undo;
              if (
                await persist(() => entry.before, undefined, entry.documentId)
              ) {
                setToast("방금 추가한 문서를 되돌렸어요.");
                setUndo(null);
              }
            }}
          >
            되돌리기
          </button>
          <button aria-label="되돌리기 알림 닫기" onClick={() => setUndo(null)}>
            <X size={15} />
          </button>
        </div>
      )}
      {toast && (
        <div className="care-toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button aria-label="알림 닫기" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function PageHeader({
  title,
  eyebrow,
  back,
}: {
  title: string;
  eyebrow: string;
  back: () => void;
}) {
  return (
    <header className="subpage-header">
      <button
        className="icon-button"
        onClick={back}
        aria-label="홈으로 돌아가기"
      >
        <ArrowLeft size={24} />
      </button>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
    </header>
  );
}

function Briefing({
  pet,
  analysis,
  onDocument,
  onEnable,
}: {
  pet: AppState;
  analysis: ReturnType<typeof useHealthAnalysis>;
  onDocument: (d: DocumentRecord) => void;
  onEnable: () => void;
}) {
  const brief = pet.briefing;
  const stale =
    !!brief && !!analysis.hash && brief.contextHash !== analysis.hash;
  const source = (ids: string[]) =>
    pet.documents
      .filter((d) => ids.includes(d.id))
      .map((d) => (
        <button
          className="source-link"
          key={d.id}
          onClick={() => onDocument(d)}
        >
          <FileText size={12} />
          {d.date.slice(5).replace("-", ".")}
          {" "}진료 기록 <ArrowUpRight size={12} />
        </button>
      ));
  return (
    <section
      className="briefing-section"
      aria-label={`${pet.profile.name} 건강 브리핑`}
    >
      <div className="section-top">
        <span className="eyebrow">
          <i className="status-dot" /> DAILY BRIEFING
        </span>
        <button
          className="icon-button"
          disabled={analysis.loading || pet.sample}
          onClick={analysis.refresh}
          aria-label="건강 브리핑 다시 분석"
        >
          <RefreshCw
            size={17}
            className={analysis.loading ? "animate-spin" : ""}
          />
        </button>
      </div>
      <div className="brief-hero">
        <div className="brief-hero-top">
          <span>
            <Sparkles size={16} />
            함께 보는 건강
          </span>
          <span className="hero-number">01</span>
        </div>
        <h1>
          {pet.profile.name}의 오늘,
          <br />
          <em>이렇게 살펴봐요.</em>
        </h1>
        <p>
          {pet.sample
            ? "매일의 투약과 병원 기록을 한곳에 모아요. 문서를 올리면 쌓인 병력을 연결해 우리 아이의 상태를 정리해 드려요."
            : brief
              ? brief.summary
              : analysis.loading
                ? "새 진료 내용과 이전 병력을 연결하고 있어요. 잠시만 기다려 주세요."
                : "첫 진료 기록이 도착했어요. 쌓인 병력과 처방을 함께 살펴볼게요."}
        </p>
        <div className="brief-hero-bottom">
          <span className="hero-paw">
            <Heart size={20} />
          </span>
          <span>
            {pet.sample
              ? "샘플 · 실제 건강 분석이 아니에요"
              : analysis.loading
                ? "새로운 기록 분석 중"
                : brief
                  ? `${clock(brief.generatedAt)} 분석`
                  : "문서와 투약 기록을 바탕으로"}
          </span>
          <Activity size={25} />
        </div>
      </div>
      {stale && (
        <p className="analysis-note">
          새 기록을 분석하고 있어요. 아래는 이전 브리핑이에요.
        </p>
      )}
      {!pet.sample && !pet.analysisConsent && (
        <button className="enable-analysis" onClick={onEnable}>
          기록 분석 켜기 <ArrowRight size={16} />
        </button>
      )}
      {(analysis.error || pet.briefingError) && (
        <p className="analysis-error" role="status">
          {analysis.error || pet.briefingError}
          <button onClick={analysis.refresh}>다시 분석</button>
        </p>
      )}
      {brief?.current.length ? (
        <details className="current-facts">
          <summary>
            기록에서 확인한 상태 <Plus size={16} />
          </summary>
          <div>
            {brief.current.map((fact, index) => (
              <article key={index}>
                <p>{fact.text}</p>
                <div className="source-row">{source(fact.sourceIds)}</div>
              </article>
            ))}
          </div>
        </details>
      ) : null}
      <div className="section-top watch-heading">
        <h2>다음 변화를 위한 준비</h2>
        <span className="tiny-pill">확인할 가능성</span>
      </div>
      {pet.sample ? (
        <div className="watch-empty">
          <span className="watch-icon">
            <Activity size={22} />
          </span>
          <h3>우리 아이의 다음도 함께.</h3>
          <p>
            이전 병력과 새 기록을 연결해, 관찰할 변화와 준비할 일을 짧게
            알려드려요.
          </p>
          <span className="small-note">
            실제 문서를 올리면 분석이 시작돼요.
          </span>
        </div>
      ) : brief?.watch.length ? (
        brief.watch.map((item, index) => (
          <article className="watch-item" key={index}>
            <span className="watch-index">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h3>{item.title}</h3>
              <p>{item.possibility}</p>
              <div className="preparation">
                <ArrowDownLeft size={16} />
                <div>
                  <strong>이렇게 준비해요</strong>
                  <p>{item.prepare}</p>
                </div>
              </div>
              <div className="source-row">{source(item.sourceIds)}</div>
              <div className="reference-row">
                {item.referenceIds.map((id) => {
                  const ref = brief.references.find((r) => r.id === id);
                  return ref ? (
                    <a key={id} href={ref.url} target="_blank" rel="noreferrer">
                      {ref.title} ↗
                    </a>
                  ) : null;
                })}
              </div>
            </div>
          </article>
        ))
      ) : (
        <div className="watch-empty">
          <Activity size={23} />
          <p>
            {analysis.loading
              ? "병력 속 연결을 살피고 있어요."
              : "현재 기록만으로 예상할 수 있는 구체적인 변화는 아직 없어요. 다음 진료 기록을 이어주세요."}
          </p>
        </div>
      )}
      {brief && (brief.questions.length > 0 || brief.unknowns.length > 0) && (
        <details className="consult-details">
          <summary>
            다음 진료에서 확인할 것 <Plus size={16} />
          </summary>
          <ul>
            {[...brief.questions, ...brief.unknowns].map((q, index) => (
              <li key={index}>{q}</li>
            ))}
          </ul>
        </details>
      )}
      <p className="briefing-note">
        확진이나 미래 질병을 단정하는 예측이 아니에요. 기록을 바탕으로
        상담·관찰할 내용을 정리해요.
      </p>
    </section>
  );
}

function MedicationList({
  pet,
  date,
  saving,
  onToggle,
  onCheck,
  onResearch,
}: {
  pet: AppState;
  date: string;
  saving: boolean;
  onToggle: (id: string) => Promise<void>;
  onCheck: (key: string) => Promise<void>;
  onResearch: (id: string) => void;
}) {
  const rows = scheduleFor(pet, date);
  const medications = pet.medications.filter(
    (m) =>
      isPrescribed(m, date) ||
      rows.some((r) => r.med.id === m.id && r.checkedAt),
  );
  const required = rows.filter((r) => !r.paused || r.checkedAt);
  const checked = required.filter((r) => r.checkedAt).length;
  return (
    <section className="medications-section" aria-label="약과 투약 체크">
      <div className="section-top">
        <div>
          <span className="eyebrow">A LITTLE CARE</span>
          <h2>
            {date === localDate() ? "오늘 챙길 약" : "이날의 투약 기록"}
            <span className="count-label">{medications.length}</span>
          </h2>
        </div>
        <span className="dose-count">
          <strong>{checked}</strong>
          <span>/ {required.length}</span>
        </span>
      </div>
      <div
        className="dose-progress"
        role="progressbar"
        aria-label="투약 기록 진행률"
        aria-valuemin={0}
        aria-valuemax={required.length || 1}
        aria-valuenow={checked}
      >
        <span
          style={{
            width: `${required.length ? (checked / required.length) * 100 : 0}%`,
          }}
        />
      </div>
      <p className="dose-helper">약을 먹인 뒤, 해당 시간에 체크해 주세요.</p>
      {medications.length ? (
        medications.map((med, index) => {
          const plan = revisionAt(med, date)!;
          const paused = med.pauses.some((p) => !p.end);
          const medRows = rows.filter((r) => r.med.id === med.id);
          return (
            <article
              className={`med-card ${paused ? "is-paused" : ""}`}
              key={med.id}
            >
              <div className="med-card-top">
                <span className={`med-symbol symbol-${index % 3}`}>
                  <Pill size={22} />
                </span>
                <div>
                  <div className="med-name-row">
                    <h3>{med.name}</h3>
                    <button
                      className="med-search-button"
                      onClick={() => onResearch(med.id)}
                      aria-label={`${med.name} 약 정보 검색`}
                    >
                      <Search size={13} />
                      <span>검색</span>
                    </button>
                  </div>
                  <p>{plan.dose}</p>
                </div>
                <Switch
                  checked={!paused}
                  disabled={saving}
                  onCheckedChange={() => void onToggle(med.id)}
                  aria-label={`${med.name} 복용 중`}
                />
              </div>
              <div className="med-schedule">
                {medRows.map((row) => (
                  <label
                    className={`dose-chip ${row.checkedAt ? "done" : ""} ${row.paused && !row.checkedAt ? "paused" : ""}`}
                    key={row.key}
                  >
                    <Clock3 size={14} />
                    <span>{row.time}</span>
                    <small>
                      {row.checkedAt
                        ? "먹였어요"
                        : row.paused
                          ? "쉬는 시간"
                          : "투약 체크"}
                    </small>
                    <Checkbox
                      checked={!!row.checkedAt}
                      disabled={saving || (!!row.paused && !row.checkedAt)}
                      onCheckedChange={() => void onCheck(row.key)}
                      aria-label={`${date} ${row.time} ${med.name} 투약 확인`}
                    />
                  </label>
                ))}
              </div>
              <div className="med-card-footer">
                <span>
                  {plan.startDate.replaceAll("-", ".")} —{" "}
                  {plan.endDate
                    ? plan.endDate.slice(5).replace("-", ".")
                    : "종료일 미기재"}
                </span>
                <span className={paused ? "paused-label" : "taking-label"}>
                  <i />
                  {paused ? "복용 쉬는 중" : "복용 중"}
                </span>
              </div>
            </article>
          );
        })
      ) : (
        <div className="med-empty">
          <Pill size={27} />
          <h3>이날의 처방약이 없어요</h3>
          <p>
            처방 기간이 시작되면 이곳에 나타나요.
            <br />새 처방을 받았다면 문서로 이어주세요.
          </p>
        </div>
      )}
      <p className="toggle-note">
        토글을 끄면 쉬는 기간을 기록해요. 처방은 그대로 남아요.
      </p>
    </section>
  );
}

function Timeline({
  pet,
  limit,
  onDocument,
}: {
  pet: AppState;
  limit?: number;
  onDocument: (d: DocumentRecord) => void;
}) {
  const events = timelineEntries(pet);
  const visible = limit ? events.slice(0, limit) : events;
  return (
    <div className="care-timeline">
      {visible.length ? (
        visible.map((event) => {
          const doc =
            event.type === "document"
              ? pet.documents.find((d) => `document:${d.id}` === event.id)
              : undefined;
          return (
            <article
              className={`timeline-event event-${event.type}`}
              key={event.id}
            >
              <span className="timeline-dot">
                {event.type === "document" ? (
                  <FileText size={16} />
                ) : event.type === "check" ? (
                  <Check size={16} />
                ) : event.type === "pause" ? (
                  <Clock3 size={16} />
                ) : (
                  <Pill size={16} />
                )}
              </span>
              <div>
                <time>
                  {event.type === "document"
                    ? event.at
                    : clock(event.at)}
                </time>
                {doc ? (
                  <button onClick={() => onDocument(doc)}>
                    <h3>{event.title}</h3>
                    <ArrowUpRight size={17} />
                  </button>
                ) : (
                  <h3>{event.title}</h3>
                )}
                <p>{doc?.diagnosis || event.detail}</p>
                {doc && (
                  <div className="timeline-tags">
                    {doc.dateSource === "issued" && <span>발급일 기준</span>}
                    {doc.conditions?.slice(0, 2).map((c, i) => (
                      <span key={i}>{c.name}</span>
                    ))}
                    {doc.items.length > 0 && (
                      <span>처방약 {doc.items.length}개</span>
                    )}
                  </div>
                )}
              </div>
            </article>
          );
        })
      ) : (
        <div className="timeline-empty">첫 기록부터, 하나씩 쌓아가요.</div>
      )}
    </div>
  );
}
function HealthPeriods({ pet }: { pet: AppState }) {
  const periods = healthPeriods(pet);
  return (
    <section className="health-periods">
      <div className="section-top">
        <h2>기록으로 보는 기간</h2>
        <span className="tiny-pill">진료 문서 기준</span>
      </div>
      {periods.length ? (
        periods.map((period) => (
          <article
            className={`period-card period-${period.type}`}
            key={period.id}
          >
            <div>
              <span>
                {period.type === "condition" ? (
                  <Heart size={16} />
                ) : (
                  <Pill size={16} />
                )}{" "}
                {period.type === "condition" ? "병력 기록" : "처방 기간"}
              </span>
              <strong>{period.name}</strong>
              <p>{period.label}</p>
            </div>
            <div className="period-track">
              <i />
              <span />
              <i className={period.end ? "" : "open"} />
            </div>
            <div className="period-dates">
              <span>{period.start}</span>
              <span>{period.end || "종료 미확인"}</span>
            </div>
            {period.note && <p className="period-note">{period.note}</p>}
          </article>
        ))
      ) : (
        <p className="timeline-note">
          문서에 확인된 병력·처방 기간이 생기면 표시해요.
        </p>
      )}
    </section>
  );
}

function CalendarSheet({
  open,
  onOpenChange,
  value,
  onSelect,
  pet,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value: string;
  onSelect: (v: string) => void;
  pet: AppState | null;
}) {
  const [month, setMonth] = useState(value.slice(0, 7));
  const [selected, setSelected] = useState(value);
  useEffect(() => {
    if (open) {
      setMonth(value.slice(0, 7));
      setSelected(value);
    }
  }, [open, value]);
  const [year, m] = month.split("-").map(Number);
  const first = new Date(year, m - 1, 1);
  const days = new Date(year, m, 0).getDate();
  const shift = (n: number) => {
    const next = new Date(year, m - 1 + n, 1);
    setMonth(
      `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`,
    );
  };
  const visitDates = new Set(pet?.documents.map((d) => d.date));
  const doseDates = new Set(
    Object.keys(pet?.checks ?? {}).map((key) => key.split("|")[1]),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="sheet" className="bottom-sheet calendar-sheet">
        <div className="sheet-handle" />
        <DialogTitle className="sheet-title">어느 날을 볼까요?</DialogTitle>
        <DialogDescription className="sheet-description">
          날짜를 골라 그날의 투약 기록을 확인해요.
        </DialogDescription>
        <div className="calendar-month">
          <button
            className="icon-button"
            aria-label="이전 달"
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={22} />
          </button>
          <strong>
            {year}년 {m}월
          </strong>
          <button
            className="icon-button"
            aria-label="다음 달"
            onClick={() => shift(1)}
          >
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="calendar-grid">
          <div className="weekdays">
            {"일월화수목금토".split("").map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="calendar-days">
            {Array.from({ length: first.getDay() }, (_, i) => (
              <span key={`blank${i}`} />
            ))}
            {Array.from({ length: days }, (_, i) => {
              const day = `${month}-${String(i + 1).padStart(2, "0")}`;
              return (
                <button
                  className={`${day === selected ? "selected" : ""} ${day === localDate() ? "today" : ""}`}
                  key={day}
                  onClick={() => setSelected(day)}
                  aria-label={`${day} 선택`}
                  aria-pressed={day === selected}
                >
                  {i + 1}
                  <span className="calendar-dots">
                    {visitDates.has(day) && <i />}
                    {doseDates.has(day) && <i className="dose-dot" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="calendar-legend">
          <span>
            <i />
            진료 기록
          </span>
          <span>
            <i />
            투약 체크
          </span>
          <button
            onClick={() => {
              setSelected(localDate());
              setMonth(localDate().slice(0, 7));
            }}
          >
            오늘로
          </button>
        </div>
        <label className="calendar-direct">
          날짜 직접 선택
          <input
            type="date"
            value={selected}
            onChange={(e) => {
              if (e.target.value) {
                setSelected(e.target.value);
                setMonth(e.target.value.slice(0, 7));
              }
            }}
          />
        </label>
        <Button
          className="sheet-confirm"
          size="lg"
          onClick={() => onSelect(selected)}
        >
          이 날짜 보기 <ArrowRight size={18} />
        </Button>
      </DialogContent>
    </Dialog>
  );
}
function DocumentSheet({
  document: doc,
  onClose,
}: {
  document: DocumentRecord | null;
  onClose: () => void;
}) {
  const [source, setSource] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setSource("");
    setError("");
    if (!doc || doc.sample) return;
    let cancelled = false;
    let url = "";
    readFile(doc.id)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          url = URL.createObjectURL(blob);
          setSource(url);
        } else setError("원본 사진을 찾을 수 없어요.");
      })
      .catch(() => setError("원본을 열지 못했어요."));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [doc]);
  return (
    <Dialog
      open={!!doc}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent variant="sheet" className="bottom-sheet document-sheet">
        <div className="sheet-handle" />
        <DialogTitle className="sheet-title">
          {doc?.kind === "diagnosis"
            ? "진단서"
            : doc?.kind === "prescription" ? "처방전" : "진료 기록"}
        </DialogTitle>
        <DialogDescription className="sheet-description">
          {doc ? documentDateLabel(doc) : ""}
        </DialogDescription>
        {doc && (
          <>
            <p className="document-diagnosis">
              {doc.diagnosis ||
                doc.summary ||
                "진단 내용이 기재되지 않은 문서예요."}
            </p>
            {doc.conditions?.length ? (
              <div className="timeline-tags">
                {doc.conditions.map((c, i) => (
                  <span key={i}>
                    {c.name} ·{" "}
                    {
                      (
                        {
                          diagnosed: "진단",
                          suspected: "의심",
                          history: "과거 병력",
                          resolved: "종료 기록",
                        } as const
                      )[c.status]
                    }
                  </span>
                ))}
              </div>
            ) : null}
            {doc.animal?.weight && (
              <p className="document-uploaded">문서상 체중 {doc.animal.weight}</p>
            )}
            <div className="document-prescriptions">
              {doc.items.map((item, i) => (
                <div key={i}>
                  <Pill size={18} />
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.dose} · {item.times.join(" / ")}
                    </p>
                    {(item.frequency ||
                      item.durationDays ||
                      item.totalQuantity) && (
                      <small>
                        원문{" "}
                        {[
                          item.frequency,
                          item.durationDays
                            ? `처방일수 ${item.durationDays}`
                            : "",
                          item.totalQuantity
                            ? `판매 수량 ${item.totalQuantity}`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {source ? (
              <a href={source} target="_blank" rel="noreferrer">
                <img
                  className="document-original"
                  src={source}
                  alt="진료 문서 원본 사진"
                />
              </a>
            ) : (
              <p className="document-source-note">
                {doc.sample
                  ? "가상의 샘플 문서예요."
                  : error || "원본 사진을 불러오는 중이에요."}
              </p>
            )}
            <p className="document-uploaded">
              업로드 {clock(doc.createdAt)} · 타임라인은 서류 기준일·시각
              기준이에요.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
