import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Clock3,
  Dog,
  FilePlus2,
  FileText,
  Heart,
  House,
  ImagePlus,
  LoaderCircle,
  LockKeyhole,
  Pause,
  Pencil,
  Pill,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  applyPrescription,
  emptyState,
  isDate,
  isPrescribed,
  localDate,
  revisionAt,
  sampleState,
  scheduleFor,
  shiftDate,
  toggleCheck,
  toggleMedication,
  uid,
  validateItems,
  type AppState,
  type DocumentRecord,
  type Extraction,
  type Medication,
  type PrescriptionItem,
} from "@/lib/domain";
import { fingerprint, readFile, readState, writeState } from "@/lib/storage";
import { analysisImage } from "@/lib/image";

type Tab = "today" | "medications" | "records";
type Draft = {
  extraction: Extraction;
  file: File;
  fingerprint: string;
  manual: boolean;
};
const navigation = [
  { id: "today" as Tab, label: "오늘의 투약", icon: House },
  { id: "medications" as Tab, label: "우리 아이 약", icon: Pill },
  { id: "records" as Tab, label: "진료 기록", icon: FileText },
];
const shortDate = (date: string) =>
  new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(
    new Date(`${date}T12:00:00`),
  );
const timeLabel = (time: string) => {
  const h = Number(time.slice(0, 2));
  return `${h < 12 ? "오전" : "오후"} ${h % 12 || 12}:${time.slice(3)}`;
};
const dateTime = (date: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(date));
const blankItem = (): PrescriptionItem => ({
  name: "",
  dose: "",
  times: ["08:00", "20:00"],
  startDate: localDate(),
  endDate: "",
  instructions: "",
  action: "prescribe",
});

export default function LuvoApp() {
  const [state, setState] = useState<AppState | null>(null);
  const stateRef = useRef<AppState | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [date, setDate] = useState(localDate());
  const [saving, setSaving] = useState(false);
  const [fatal, setFatal] = useState("");
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
    null,
  );
  const [uploadOpen, setUploadOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [name, setName] = useState("");
  const [detail, setDetail] = useState("");
  const [document, setDocument] = useState<DocumentRecord | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [originalError, setOriginalError] = useState("");
  const [historyMed, setHistoryMed] = useState<Medication | null>(null);
  const [undo, setUndo] = useState<{
    before: AppState;
    documentId: string;
  } | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const busy = useRef(false);

  useEffect(() => {
    const load = () =>
      readState()
        .then((value) => {
          stateRef.current = value;
          setState(value);
        })
        .catch(() =>
          setFatal(
            "브라우저 저장소를 열지 못했어요. 저장 공간과 브라우저 설정을 확인한 뒤 다시 열어 주세요.",
          ),
        );
    void load();
    if (typeof BroadcastChannel !== "undefined") {
      channel.current = new BroadcastChannel("luvo-records");
      channel.current.onmessage = () => {
        setUndo(null);
        void load();
      };
    }
    return () => channel.current?.close();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    setOriginal(null);
    setOriginalError("");
    if (!document || document.sample) return;
    let url: string | null = null;
    let cancelled = false;
    readFile(document.id)
      .then((blob) => {
        if (cancelled) return;
        if (blob) {
          url = URL.createObjectURL(blob);
          setOriginal(url);
        } else setOriginalError("원본 사진을 찾을 수 없어요.");
      })
      .catch(() =>
        setOriginalError("사진을 열지 못했어요. 다시 시도해 주세요."),
      );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [document]);

  async function mutate(
    change: (s: AppState) => AppState,
    file?: { id: string; blob: Blob },
    reset = false,
    removeFileId?: string,
  ): Promise<boolean> {
    if (busy.current) return false;
    busy.current = true;
    setSaving(true);
    try {
      const task = async () => {
        const current = await readState();
        const next = change(current);
        await writeState(next, file, reset, removeFileId);
        stateRef.current = next;
        setState(next);
        setUndo(null);
        channel.current?.postMessage("updated");
      };
      if (navigator.locks) await navigator.locks.request("luvo-save", task);
      else await task();
      return true;
    } catch (error) {
      setToast({
        text:
          error instanceof Error
            ? error.message
            : "저장하지 못했어요. 브라우저 저장 공간을 확인해 주세요.",
        error: true,
      });
      return false;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function handleToggle(med: Medication) {
    const wasPaused = med.pauses.some((p) => p.end === null);
    if (await mutate((s) => toggleMedication(s, med.id)))
      setToast({
        text: wasPaused
          ? "복용을 다시 시작해요. 쉰 기간도 기록했어요."
          : "복용을 쉬는 기간을 기록할게요.",
      });
  }
  async function handleCheck(key: string) {
    const checked = !!stateRef.current?.checks[key];
    if (await mutate((s) => toggleCheck(s, key)))
      setToast({
        text: checked
          ? "투약 체크를 취소했어요."
          : "잘 챙겨주셨어요. 투약을 기록했어요.",
      });
  }
  async function installSample() {
    if (!state || state.documents.length) return;
    if (await mutate(() => sampleState()))
      setToast({ text: "가상의 샘플 기록이에요. 자유롭게 살펴보세요." });
  }
  function openSettings() {
    setName(
      state?.profile.name === "우리 아이" ? "" : (state?.profile.name ?? ""),
    );
    setDetail(
      state?.profile.detail === "함께 쌓아가는 건강 기록"
        ? ""
        : (state?.profile.detail ?? ""),
    );
    setResetConfirm(false);
    setSettingsOpen(true);
  }

  if (fatal)
    return (
      <div className="boot-screen">
        <div className="boot-icon">
          <ShieldCheck />
        </div>
        <h1>기록을 열지 못했어요</h1>
        <p>{fatal}</p>
        <Button onClick={() => location.reload()}>다시 열기</Button>
      </div>
    );
  if (!state)
    return (
      <div className="boot-screen">
        <Dog className="size-10 text-primary" />
        <p>우리 아이의 기록을 열고 있어요</p>
        <LoaderCircle className="size-5 animate-spin text-primary" />
      </div>
    );

  const today = localDate();
  const schedule = scheduleFor(state, date);
  const visible = schedule.filter((item) => !item.paused || item.checkedAt);
  const done = visible.filter((item) => item.checkedAt).length;
  const currentMeds = state.medications.filter((m) => isPrescribed(m, today));
  const activeMeds = currentMeds.filter(
    (m) => !m.pauses.some((p) => p.end === null),
  );
  const groups = [...new Set(visible.map((item) => item.time))];
  const monday = shiftDate(
    date,
    -((new Date(`${date}T12:00:00`).getDay() + 6) % 7),
  );
  const week = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));
  const hasRecords = state.documents.length > 0;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Luvo 홈">
          <span className="brand-mark">
            <Dog size={25} strokeWidth={2.2} />
          </span>
          <span>
            luvo<span className="brand-period">.</span>
          </span>
        </a>
        <p className="brand-caption">오래 함께하기 위한 작은 기록</p>
        <div className="sidebar-label">우리 아이 케어</div>
        <nav className="main-nav" aria-label="주 메뉴">
          {navigation.map((item) => (
            <button
              key={item.id}
              className={cn("nav-item", tab === item.id && "active")}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? "page" : undefined}
            >
              <item.icon size={21} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.id === "records" && state.documents.length > 0 && (
                <span className="nav-count">{state.documents.length}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-note">
            <span>
              <LockKeyhole size={16} />
            </span>
            <div>
              <strong>
                우리 아이의 기록은
                <br />이 브라우저에 남아요
              </strong>
              <p>로그인 없이, 가볍게 시작해요</p>
            </div>
          </div>
          <button className="sidebar-pet" onClick={openSettings}>
            <span className="pet-avatar">
              <Dog size={23} />
            </span>
            <span>
              <strong>{state.profile.name}</strong>
              <small>{state.profile.detail}</small>
            </span>
            <Settings2 size={17} />
          </button>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <Dog size={25} />
            <span>luvo.</span>
          </div>
          <div className="desktop-breadcrumb">
            우리 아이 케어 <ChevronRight size={13} />
            <span>{navigation.find((n) => n.id === tab)?.label}</span>
          </div>
          <div className="topbar-right">
            <span className="save-status">
              <i className={saving ? "saving" : ""} />
              {saving ? "저장하고 있어요" : "이 브라우저에 저장 중"}
            </span>
            <button
              className="topbar-settings"
              aria-label="우리 아이 정보와 설정"
              onClick={openSettings}
            >
              <Settings2 size={20} />
            </button>
          </div>
        </header>
        <main className="main-content">
          {state.sample && (
            <div className="sample-banner">
              <Sparkles size={15} />
              <span>샘플 기록을 체험하고 있어요</span>
              <button onClick={openSettings}>
                내 기록으로 시작하기 <ArrowRight size={14} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {tab === "today"
                  ? "매일의 작은 약속"
                  : tab === "medications"
                    ? "지금의 처방을 한눈에"
                    : "쌓일수록 든든한 기억"}
              </p>
              <h1>
                {tab === "today"
                  ? "오늘의 투약"
                  : tab === "medications"
                    ? "우리 아이 약"
                    : "진료 기록"}
              </h1>
              <p className="page-description">
                {tab === "today"
                  ? `${state.profile.name}의 하루, 하나씩 함께 챙겨요.`
                  : tab === "medications"
                    ? "복용을 쉬는 동안에는 토글만 꺼두세요."
                    : "처방전 한 장이 우리 아이의 건강 기록이 돼요."}
              </p>
            </div>
            <Button
              className="heading-upload"
              onClick={() => setUploadOpen(true)}
            >
              <Plus size={18} />
              처방전 올리기
            </Button>
          </div>

          {tab === "today" && (
            <div className="dashboard-grid">
              <div className="dashboard-primary">
                <section className="week-section" aria-label="투약 날짜 선택">
                  <div className="calendar-heading">
                    <div className="month-label">
                      <CalendarDays size={18} />
                      <span>
                        {new Date(`${date}T12:00:00`).getFullYear()}년{" "}
                        {new Date(`${date}T12:00:00`).getMonth() + 1}월
                      </span>
                      <label
                        className="calendar-picker"
                        aria-label="날짜 직접 선택"
                      >
                        <ChevronDown size={15} />
                        <input
                          type="date"
                          value={date}
                          onChange={(e) =>
                            isDate(e.target.value) && setDate(e.target.value)
                          }
                          aria-label="투약 기록 날짜"
                        />
                      </label>
                    </div>
                    <div className="calendar-controls">
                      <button
                        aria-label="지난주"
                        onClick={() => setDate(shiftDate(date, -7))}
                      >
                        <ChevronLeft size={19} />
                      </button>
                      <button
                        className="today-link"
                        onClick={() => setDate(today)}
                      >
                        오늘
                      </button>
                      <button
                        aria-label="다음 주"
                        onClick={() => setDate(shiftDate(date, 7))}
                      >
                        <ChevronRight size={19} />
                      </button>
                    </div>
                  </div>
                  <div className="week-strip">
                    {week.map((day) => (
                      <button
                        key={day}
                        className={cn(
                          "day-button",
                          day === date && "selected",
                          day === today && "is-today",
                        )}
                        onClick={() => setDate(day)}
                        aria-label={`${shortDate(day)} 투약 기록`}
                        aria-pressed={day === date}
                      >
                        <span>
                          {
                            ["일", "월", "화", "수", "목", "금", "토"][
                              new Date(`${day}T12:00:00`).getDay()
                            ]
                          }
                        </span>
                        <strong>{Number(day.slice(8))}</strong>
                        <i />
                      </button>
                    ))}
                  </div>
                </section>

                {hasRecords ? (
                  <>
                    <section className="progress-card">
                      <div className="progress-copy">
                        <div className="progress-label">
                          {date === today ? "오늘의" : shortDate(date)} 투약
                          기록
                        </div>
                        <h2>
                          {visible.length > 0 && done === visible.length ? (
                            "모두 챙겼어요. 고마워요!"
                          ) : visible.length ? (
                            <>
                              차근차근, <span>{done}개</span> 챙겼어요
                            </>
                          ) : (
                            "예정된 투약이 없어요"
                          )}
                        </h2>
                        <p>
                          {visible.length
                            ? `총 ${visible.length}번 중 ${done}번 투약을 기록했어요`
                            : "이 날짜에 체크할 투약 일정이 없어요"}
                        </p>
                        <div
                          className="progress-track"
                          role="progressbar"
                          aria-label="투약 기록 진행률"
                          aria-valuenow={done}
                          aria-valuemin={0}
                          aria-valuemax={visible.length || 1}
                        >
                          <div
                            style={{
                              width: `${visible.length ? (done / visible.length) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                      <div
                        className="progress-ring"
                        style={
                          {
                            "--progress": `${visible.length ? (done / visible.length) * 100 : 0}%`,
                          } as React.CSSProperties
                        }
                      >
                        <div>
                          <CheckCheck size={27} />
                          <span>
                            {done}
                            <small> / {visible.length}</small>
                          </span>
                        </div>
                      </div>
                    </section>
                    <div className="section-heading schedule-heading">
                      <h2>
                        {date === today
                          ? "오늘 먹일 약"
                          : `${shortDate(date)}에 먹일 약`}
                      </h2>
                      <span>{groups.length}개의 시간대</span>
                    </div>
                    {groups.length ? (
                      groups.map((time) => {
                        const items = visible.filter(
                          (item) => item.time === time,
                        );
                        const isMorning = Number(time.slice(0, 2)) < 12;
                        return (
                          <section className="schedule-group" key={time}>
                            <div className="time-heading">
                              <span
                                className={cn(
                                  "time-icon",
                                  !isMorning && "evening",
                                )}
                              >
                                <Clock3 size={16} />
                              </span>
                              <h3>{timeLabel(time)}</h3>
                              <span>
                                {items.every((item) => item.checkedAt) ? (
                                  <span className="complete-label">
                                    <Check size={13} />
                                    완료
                                  </span>
                                ) : (
                                  `${items.length}개`
                                )}
                              </span>
                            </div>
                            <div className="dose-list">
                              {items.map((item) => {
                                const future = date > today;
                                return (
                                  <label
                                    key={item.key}
                                    className={cn(
                                      "dose-row",
                                      item.checkedAt && "checked",
                                      future && "future",
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "medicine-icon",
                                        !isMorning && "lavender",
                                      )}
                                    >
                                      <Pill size={22} strokeWidth={1.7} />
                                    </span>
                                    <span className="dose-copy">
                                      <strong>{item.med.name}</strong>
                                      <span>
                                        {item.revision.dose}
                                        {item.revision.instructions && (
                                          <>
                                            {" "}
                                            <i /> {item.revision.instructions}
                                          </>
                                        )}
                                      </span>
                                      {item.checkedAt && (
                                        <small>
                                          <Check size={12} />
                                          {new Date(
                                            item.checkedAt,
                                          ).toLocaleTimeString("ko-KR", {
                                            hour: "2-digit",
                                            minute: "2-digit",
                                            hour12: false,
                                          })}{" "}
                                          기록했어요
                                        </small>
                                      )}
                                    </span>
                                    <span className="dose-control">
                                      <span>
                                        {item.checkedAt
                                          ? "먹였어요"
                                          : future
                                            ? "예정"
                                            : "투약 체크"}
                                      </span>
                                      <Checkbox
                                        checked={!!item.checkedAt}
                                        disabled={saving || future}
                                        onCheckedChange={() =>
                                          void handleCheck(item.key)
                                        }
                                        aria-label={`${shortDate(date)} ${time} ${item.med.name} 투약 확인`}
                                      />
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </section>
                        );
                      })
                    ) : (
                      <div className="quiet-empty">
                        <Pause size={26} />
                        <h3>이 날짜에는 투약 일정이 없어요</h3>
                        <p>약의 처방 기간과 복용 토글을 확인해 주세요.</p>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setTab("medications")}
                        >
                          우리 아이 약 보기
                        </Button>
                      </div>
                    )}
                    <p className="schedule-footnote">
                      <CircleHelp size={14} />
                      체크하지 않은 약은 미확인으로 남아요.
                    </p>
                  </>
                ) : (
                  <section className="welcome-card">
                    <div className="welcome-illustration" aria-hidden="true">
                      <div className="illustration-paper">
                        <div className="mini-cross">
                          <Plus size={21} strokeWidth={3} />
                        </div>
                        <span />
                        <span />
                        <div className="paper-row">
                          <i />
                          <b />
                        </div>
                        <div className="paper-row">
                          <i />
                          <b />
                        </div>
                        <div className="illustration-pill">
                          <Pill size={32} />
                        </div>
                        <span className="illustration-check">
                          <Check size={18} strokeWidth={3} />
                        </span>
                      </div>
                      <i className="deco-dot one" />
                      <i className="deco-dot two" />
                    </div>
                    <span className="soft-tag">처음 만나는 건강 기록</span>
                    <h2>
                      처방전 한 장으로
                      <br />
                      가볍게 시작해요
                    </h2>
                    <p>
                      약 이름과 먹일 시간을 정리해 드릴게요.
                      <br />
                      매일 먹였는지만 체크하면 돼요.
                    </p>
                    <Button size="lg" onClick={() => setUploadOpen(true)}>
                      <ImagePlus size={19} />첫 처방전 올리기
                    </Button>
                    <button
                      className="sample-link"
                      onClick={() => void installSample()}
                    >
                      먼저 샘플로 둘러볼게요 <ArrowRight size={15} />
                    </button>
                  </section>
                )}
              </div>
              <aside className="dashboard-secondary">
                <section className="pet-card">
                  <div className="pet-card-heading">
                    <span className="pet-avatar large">
                      <Dog size={34} strokeWidth={1.5} />
                    </span>
                    <button
                      className="subtle-icon"
                      onClick={openSettings}
                      aria-label="강아지 정보 수정"
                    >
                      <Pencil size={16} />
                    </button>
                  </div>
                  <h2>
                    {state.profile.name}
                    <Heart size={16} />
                  </h2>
                  <p>{state.profile.detail}</p>
                  <div className="pet-stats">
                    <div>
                      <strong>
                        {activeMeds.length}
                        <span>개</span>
                      </strong>
                      <small>복용 중인 약</small>
                    </div>
                    <div>
                      <strong>
                        {state.documents.length}
                        <span>개</span>
                      </strong>
                      <small>쌓인 진료 기록</small>
                    </div>
                  </div>
                </section>
                <section className="quick-meds">
                  <div className="section-heading">
                    <h2>복용 중인 약</h2>
                    <button
                      onClick={() => setTab("medications")}
                      aria-label="약 전체 보기"
                    >
                      <ArrowUpRight size={18} />
                    </button>
                  </div>
                  {currentMeds.length ? (
                    currentMeds.map((med, index) => (
                      <div className="quick-med" key={med.id}>
                        <span
                          className={cn("small-pill", index % 2 && "lavender")}
                        >
                          <Pill size={18} />
                        </span>
                        <div>
                          <strong>{med.name}</strong>
                          <span>
                            {med.pauses.some((p) => !p.end)
                              ? "지금은 쉬는 중"
                              : revisionAt(med, today)?.dose}
                          </span>
                        </div>
                        <Switch
                          checked={!med.pauses.some((p) => !p.end)}
                          disabled={saving}
                          onCheckedChange={() => void handleToggle(med)}
                          aria-label={`${med.name} 복용 중`}
                        />
                      </div>
                    ))
                  ) : (
                    <div className="side-empty">
                      <Pill size={21} />
                      <p>
                        처방전을 올리면
                        <br />
                        우리 아이 약이 여기에 모여요.
                      </p>
                    </div>
                  )}
                  {currentMeds.length > 0 && (
                    <p className="tiny-hint">쉬는 동안에는 토글만 꺼두세요.</p>
                  )}
                </section>
                <section className="memory-note">
                  <span>
                    <FilePlus2 size={22} strokeWidth={1.7} />
                  </span>
                  <h3>병원에 다녀왔다면?</h3>
                  <p>
                    새 처방전을 올려주세요.
                    <br />
                    바뀐 내용을 이어서 정리할게요.
                  </p>
                  <button onClick={() => setUploadOpen(true)}>
                    진료 기록 추가하기 <ArrowRight size={15} />
                  </button>
                </section>
              </aside>
            </div>
          )}

          {tab === "medications" && (
            <>
              <div className="info-banner">
                <span>
                  <Pill size={20} />
                </span>
                <div>
                  <strong>처방은 그대로, 복용 여부만 간편하게</strong>
                  <p>
                    토글을 끄면 쉬는 기간을 기록해요. 새 처방은 사진으로
                    올려주세요.
                  </p>
                </div>
              </div>
              {state.medications.length ? (
                <div className="medication-grid">
                  {state.medications.map((med, i) => {
                    const valid = isPrescribed(med, today);
                    const paused = med.pauses.some((p) => !p.end);
                    const revision =
                      revisionAt(med, today) ?? med.revisions.at(-1)!;
                    return (
                      <article
                        key={med.id}
                        className={cn(
                          "medication-card",
                          (!valid || paused) && "is-paused",
                        )}
                      >
                        <div className="med-card-top">
                          <span
                            className={cn("medicine-icon", i % 2 && "lavender")}
                          >
                            <Pill size={24} />
                          </span>
                          <span
                            className={cn(
                              "status-badge",
                              (!valid || paused) && "muted",
                            )}
                          >
                            {!valid
                              ? "현재 처방 기간 아님"
                              : paused
                                ? "복용 쉬는 중"
                                : "복용 중"}
                          </span>
                          <Switch
                            checked={valid && !paused}
                            disabled={saving || !valid}
                            onCheckedChange={() => void handleToggle(med)}
                            aria-label={`${med.name} 복용 중`}
                          />
                        </div>
                        <h2>{med.name}</h2>
                        <p className="med-dose">
                          {revision.dose || "중단된 처방"}
                        </p>
                        <div className="med-details">
                          <p>
                            <Clock3 size={15} />
                            {revision.times.map(timeLabel).join(" · ") ||
                              "투약 일정 없음"}
                          </p>
                          <p>
                            <CalendarDays size={15} />
                            {shortDate(revision.startDate)}부터
                            {revision.endDate
                              ? ` ${shortDate(revision.endDate)}까지`
                              : " · 종료일 미정"}
                          </p>
                          {revision.instructions && (
                            <p>
                              <FileText size={15} />
                              {revision.instructions}
                            </p>
                          )}
                        </div>
                        <button
                          className="med-history-link"
                          onClick={() => setHistoryMed(med)}
                        >
                          처방·미복용 이력 보기 <ChevronRight size={16} />
                        </button>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  icon={Pill}
                  title="아직 등록된 약이 없어요"
                  description="처방전을 올리면 약과 투약 일정을 정리해 드려요."
                  action={() => setUploadOpen(true)}
                />
              )}
            </>
          )}

          {tab === "records" && (
            <>
              {state.documents.length ? (
                <>
                  <div className="records-summary">
                    <span>
                      <FileText size={24} />
                    </span>
                    <div>
                      <strong>
                        {state.profile.name}의 기록이 {state.documents.length}개
                        쌓였어요
                      </strong>
                      <p>처방전과 실제 투약 이력을 함께 기억해요.</p>
                    </div>
                  </div>
                  <div className="section-heading">
                    <h2>진료 문서</h2>
                    <span>{state.documents.length}개</span>
                  </div>
                  <div className="document-list">
                    {state.documents
                      .toSorted((a, b) => b.date.localeCompare(a.date))
                      .map((doc) => (
                        <button
                          key={doc.id}
                          className="document-row"
                          onClick={() => setDocument(doc)}
                        >
                          <span className="document-icon">
                            <FileText size={24} />
                          </span>
                          <div>
                            <span className="document-meta">
                              {shortDate(doc.date)}
                              {doc.sample && <em>샘플</em>}
                            </span>
                            <h3>{doc.clinic || "병원 진료 기록"}</h3>
                            <p>{doc.items.map((i) => i.name).join(" · ")}</p>
                          </div>
                          <span className="document-count">
                            약 {doc.items.length}개
                          </span>
                          <ChevronRight size={19} />
                        </button>
                      ))}
                  </div>
                  <div className="section-heading history-heading">
                    <h2>함께 쌓인 기록</h2>
                  </div>
                  <div className="activity-list">
                    {[
                      ...state.activities.map((a) => ({
                        id: a.id,
                        at: a.at,
                        title: a.title,
                        detail: a.detail,
                        type: a.type,
                      })),
                      ...Object.entries(state.checks).map(([key, at]) => {
                        const [id, day, time] = key.split("|");
                        return {
                          id: key,
                          at,
                          title: `${state.medications.find((m) => m.id === id)?.name ?? "처방약"} 투약했어요`,
                          detail: `${shortDate(day)} ${timeLabel(time)} 일정`,
                          type: "check",
                        };
                      }),
                    ]
                      .toSorted((a, b) => b.at.localeCompare(a.at))
                      .map((event) => (
                        <div className="activity-row" key={event.id}>
                          <span
                            className={cn(
                              "activity-dot",
                              event.type === "check" && "blue",
                            )}
                          >
                            {event.type === "check" ? (
                              <Check size={15} />
                            ) : event.type === "pause" ? (
                              <Pause size={13} />
                            ) : (
                              <FileText size={14} />
                            )}
                          </span>
                          <div>
                            <strong>{event.title}</strong>
                            <p>{event.detail}</p>
                          </div>
                          <time>{dateTime(event.at)}</time>
                        </div>
                      ))}
                  </div>
                </>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="첫 진료 기록을 남겨볼까요?"
                  description="사진 한 장이면 충분해요. 기록은 이 브라우저에 보관돼요."
                  action={() => setUploadOpen(true)}
                />
              )}
            </>
          )}
          <footer className="page-footer">
            <span>luvo.</span>
            <p>작은 기록으로, 오래 함께.</p>
            <span className="footer-storage">
              <LockKeyhole size={12} />이 브라우저에만 저장돼요
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="모바일 메뉴">
        {navigation.map((item) => (
          <button
            key={item.id}
            className={tab === item.id ? "active" : ""}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? "page" : undefined}
          >
            <item.icon size={22} strokeWidth={tab === item.id ? 2.3 : 1.7} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        state={state}
        saving={saving}
        onSaved={async (draft, doc) => {
          let previous = stateRef.current;
          const ok = await mutate(
            (s) => {
              previous = s;
              return applyPrescription(s.sample ? emptyState() : s, doc);
            },
            { id: doc.id, blob: draft.file },
            state.sample,
          );
          if (ok) {
            if (previous) setUndo({ before: previous, documentId: doc.id });
            setToast({
              text: doc.items.length
                ? "처방전과 투약 일정을 기록했어요."
                : "진료 기록을 저장했어요.",
            });
            setDocument(doc);
          }
          return { ok, previous };
        }}
      />

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <div className="modal-icon">
            <Dog size={26} />
          </div>
          <DialogTitle className="modal-title">
            우리 아이를 알려주세요
          </DialogTitle>
          <DialogDescription className="modal-description">
            이름만으로도 충분해요. 언제든 바꿀 수 있어요.
          </DialogDescription>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!name.trim()) return;
              if (
                await mutate((s) => ({
                  ...s,
                  profile: {
                    name: name.trim(),
                    detail: detail.trim() || "함께 쌓아가는 건강 기록",
                  },
                }))
              ) {
                setSettingsOpen(false);
                setToast({ text: "우리 아이 정보를 저장했어요." });
              }
            }}
          >
            <label className="field-label" htmlFor="pet-name">
              이름
            </label>
            <Input
              id="pet-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 두부"
              maxLength={20}
              required
            />
            <label className="field-label" htmlFor="pet-detail">
              품종·나이 <span>선택</span>
            </label>
            <Input
              id="pet-detail"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="예: 말티푸 · 5살"
              maxLength={60}
            />
            <Button
              className="w-full mt-6"
              type="submit"
              disabled={saving || !name.trim()}
            >
              저장하기
            </Button>
          </form>
          <div className="settings-storage">
            <LockKeyhole size={17} />
            <p>
              사진과 기록은 이 브라우저에 저장돼요.
              <br />
              브라우저 데이터를 지우면 함께 삭제돼요.
            </p>
          </div>
          {hasRecords && (
            <div className="reset-section">
              {resetConfirm ? (
                <>
                  <p>
                    이 브라우저의 사진과 기록을 모두 지울까요?
                    <br />
                    삭제한 기록은 되돌릴 수 없어요.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setResetConfirm(false)}
                    >
                      유지할게요
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={saving}
                      onClick={async () => {
                        if (await mutate(() => emptyState(), undefined, true)) {
                          setSettingsOpen(false);
                          setDate(localDate());
                          setTab("today");
                          setToast({
                            text: "이 브라우저의 기록을 초기화했어요.",
                          });
                        }
                      }}
                    >
                      모두 삭제하기
                    </Button>
                  </div>
                </>
              ) : (
                <button onClick={() => setResetConfirm(true)}>
                  <Trash2 size={14} />
                  {state.sample
                    ? "샘플 지우고 내 기록으로 시작하기"
                    : "이 브라우저의 기록 초기화"}
                </button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!document}
        onOpenChange={(open) => !open && setDocument(null)}
      >
        <DialogContent className="document-dialog">
          {document && (
            <>
              <span className="soft-tag">
                {document.sample ? "샘플 진료 기록" : "진료 기록"}
              </span>
              <DialogTitle className="modal-title">
                {document.clinic || "병원 진료 기록"}
              </DialogTitle>
              <DialogDescription className="modal-description">
                {shortDate(document.date)} · {document.items.length}개의 약
              </DialogDescription>
              {document.diagnosis && (
                <div className="diagnosis-note">
                  <FileText size={17} />
                  <p>{document.diagnosis}</p>
                </div>
              )}
              <div className="document-medications">
                {document.items.map((item, i) => (
                  <div key={i}>
                    <Pill size={18} />
                    <div>
                      <strong>{item.name}</strong>
                      <p>
                        {item.action === "stop"
                          ? "처방 중단"
                          : `${item.dose} · ${item.times.join(", ")}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {document.summary && (
                <div className="briefing-note">
                  <Sparkles size={17} />
                  <div>
                    <strong>문서에서 정리한 내용</strong>
                    <p>{document.summary}</p>
                  </div>
                </div>
              )}
              {original ? (
                <a
                  href={original}
                  download={document.filename}
                  className="original-link"
                >
                  <ArrowDownToLine size={16} />
                  원본 사진 저장
                </a>
              ) : originalError ? (
                <p className="inline-error">{originalError}</p>
              ) : (
                !document.sample && (
                  <p className="text-sm text-muted-foreground">
                    원본 사진을 여는 중이에요…
                  </p>
                )
              )}
              {original && (
                <img
                  className="original-image"
                  src={original}
                  alt={`${document.clinic} ${document.date} 처방전 원본`}
                />
              )}
              {undo?.documentId === document.id && (
                <Button
                  variant="ghost"
                  className="mt-4 text-muted-foreground"
                  onClick={async () => {
                    const before = undo.before;
                    if (
                      await mutate(() => before, undefined, false, document.id)
                    ) {
                      setDocument(null);
                      setToast({ text: "이번 문서 반영을 되돌렸어요." });
                    }
                  }}
                >
                  <RotateCcw size={15} />
                  이번 문서 반영 되돌리기
                </Button>
              )}
              <p className="tiny-hint">
                업로드 {dateTime(document.createdAt)} · 문서 내용은 진료 기록과
                함께 확인해 주세요.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!historyMed}
        onOpenChange={(open) => !open && setHistoryMed(null)}
      >
        <DialogContent>
          {historyMed && (
            <>
              <div className="modal-icon">
                <Pill size={25} />
              </div>
              <DialogTitle className="modal-title">
                {historyMed.name}
              </DialogTitle>
              <DialogDescription className="modal-description">
                처방과 실제로 쉬었던 기간을 함께 볼 수 있어요.
              </DialogDescription>
              <h3 className="mini-section-title">처방 이력</h3>
              {historyMed.revisions
                .toSorted((a, b) => b.startDate.localeCompare(a.startDate))
                .map((r, i) => (
                  <div className="history-item" key={`${r.documentId}-${i}`}>
                    <FileText size={17} />
                    <div>
                      <strong>
                        {shortDate(r.startDate)}부터
                        {r.endDate && ` ${shortDate(r.endDate)}까지`}
                      </strong>
                      <p>
                        {r.action === "stop"
                          ? "처방 중단"
                          : `${r.dose} · ${r.times.join(", ")}`}
                      </p>
                    </div>
                  </div>
                ))}
              <h3 className="mini-section-title">복용을 쉰 기간</h3>
              {historyMed.pauses.length ? (
                historyMed.pauses.toReversed().map((p) => (
                  <div className="history-item" key={p.id}>
                    <Pause size={17} />
                    <div>
                      <strong>{dateTime(p.start)}</strong>
                      <p>
                        {p.end ? `${dateTime(p.end)}까지` : "지금까지 쉬는 중"}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  기록된 미복용 기간이 없어요.
                </p>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {toast && (
        <div
          className={cn("toast", toast.error && "error")}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={19} /> : <Check size={19} />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="알림 닫기">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof Pill;
  title: string;
  description: string;
  action: () => void;
}) {
  return (
    <div className="large-empty">
      <span>
        <Icon size={34} strokeWidth={1.5} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Button onClick={action}>
        <Plus size={18} />
        처방전 올리기
      </Button>
    </div>
  );
}

function UploadDialog({
  open,
  onOpenChange,
  state,
  saving,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  state: AppState;
  saving: boolean;
  onSaved: (
    draft: Draft,
    document: DocumentRecord,
  ) => Promise<{ ok: boolean; previous: AppState | null }>;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [step, setStep] = useState<"pick" | "analyzing" | "review">("pick");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState("");
  const [consent, setConsent] = useState(false);
  const operation = useRef(0);
  useEffect(() => {
    if (!open) {
      operation.current++;
      request.current?.abort();
      setStep("pick");
      setDraft(null);
      setError("");
      setConsent(false);
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

  async function receive(file?: File) {
    if (!file || !consent || step === "analyzing") return;
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
      if (state.documents.some((d) => d.fingerprint === hash)) {
        setError("이미 등록한 문서예요. 진료 기록에서 확인해 주세요.");
        setStep("pick");
        return;
      }
      const image = await analysisImage(file);
      if (id !== operation.current) return;
      const form = new FormData();
      form.append("image", image, "prescription.jpg");
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
      const next: Draft = {
        extraction,
        file,
        fingerprint: hash,
        manual: false,
      };
      if (!extraction.medications?.length) {
        next.extraction.medications = [];
        next.extraction.warnings = [
          ...(extraction.warnings ?? []),
          "약이 없는 문서예요. 진료 내용을 확인해 주세요.",
        ];
      }
      setDraft(next);
      if (
        !extraction.warnings.length &&
        !validateItems(extraction.medications) &&
        isDate(extraction.date)
      ) {
        const result = await onSaved(next, makeDocument(next));
        if (id !== operation.current) return;
        if (result.ok) {
          onOpenChange(false);
          return;
        }
      }
      setStep("review");
    } catch (cause) {
      if (id !== operation.current) return;
      setDraft({
        extraction: {
          clinic: "",
          date: localDate(),
          diagnosis: "",
          summary: "",
          medications: [blankItem()],
          warnings: [],
        },
        file,
        fingerprint: hash || (await fingerprint(file)),
        manual: true,
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
      diagnosis: value.extraction.diagnosis,
      summary: value.manual ? "" : value.extraction.summary,
      items: value.extraction.medications,
      createdAt: new Date().toISOString(),
    };
  }
  function updateExtraction(change: Partial<Extraction>) {
    setDraft((d) =>
      d ? { ...d, extraction: { ...d.extraction, ...change } } : d,
    );
  }
  function updateItem(index: number, change: Partial<PrescriptionItem>) {
    if (draft)
      updateExtraction({
        medications: draft.extraction.medications.map((item, i) =>
          i === index ? { ...item, ...change } : item,
        ),
      });
  }
  async function save() {
    if (!draft) return;
    const issue = validateItems(draft.extraction.medications);
    if (issue || !isDate(draft.extraction.date)) {
      setError(issue || "문서 날짜를 확인해 주세요.");
      return;
    }
    setError("");
    const result = await onSaved(draft, makeDocument(draft));
    if (result.ok) onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!saving) onOpenChange(value);
      }}
    >
      <DialogContent
        className={cn("upload-dialog", step === "review" && "review-dialog")}
      >
        <div className="modal-icon">
          <FilePlus2 size={25} />
        </div>
        <DialogTitle className="modal-title">
          {step === "pick"
            ? "처방전 한 장이면 충분해요"
            : step === "analyzing"
              ? "처방전을 읽고 있어요"
              : draft?.manual
                ? "사진을 보며 기록해 주세요"
                : "이 내용만 확인해 주세요"}
        </DialogTitle>
        <DialogDescription className="modal-description">
          {step === "pick"
            ? "약 이름과 먹일 시간을 정리해 드릴게요."
            : step === "analyzing"
              ? "문서에 적힌 내용을 차근차근 확인하고 있어요."
              : draft?.manual
                ? "자동 분석을 완료하지 못했어요. 직접 입력한 내용으로 저장돼요."
                : "분명하지 않은 내용은 확인하고, 기록에 반영할게요."}
        </DialogDescription>
        {step === "pick" && (
          <>
            {state.sample && (
              <p className="sample-upload-note">
                사진을 등록하면 샘플을 비우고 내 기록으로 시작해요.
              </p>
            )}
            <div
              className={cn(
                "upload-zone",
                dragging && "dragging",
                !consent && "waiting-consent",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                if (consent) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e: DragEvent) => {
                e.preventDefault();
                setDragging(false);
                void receive(e.dataTransfer.files[0]);
              }}
            >
              <span className="upload-zone-icon">
                <ImagePlus size={35} strokeWidth={1.5} />
              </span>
              <h3>처방전·진단서 사진을 올려주세요</h3>
              <p>사진을 끌어 놓거나 아래 버튼을 눌러주세요</p>
              <Button
                variant="secondary"
                disabled={!consent}
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={17} />
                사진 선택하기
              </Button>
              <small>JPG, PNG, WebP · 최대 12MB · 한 번에 한 장</small>
            </div>
            <input
              className="sr-only"
              ref={fileInput}
              disabled={!consent}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="처방전 사진 선택"
              onChange={(e) => {
                void receive(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <label className="upload-consent">
              <Checkbox
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                aria-label="사진을 Cloudflare AI로 분석하는 데 동의"
              />
              <span>
                사진을 Cloudflare AI로 분석하는 데 동의해요.
                <small>원본과 결과는 이 브라우저에 보관돼요.</small>
              </span>
            </label>
            <div className="upload-guide">
              <ShieldCheck size={17} />
              <p>
                문서에 없는 약이나 용량을 새로 결정하지 않아요.
                <br />
                읽기 어려운 내용만 다시 확인할게요.
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
                문서 날짜
                <Input
                  type="date"
                  value={draft.extraction.date}
                  onChange={(e) => updateExtraction({ date: e.target.value })}
                />
              </label>
            </div>
            <label className="field-label">
              진단·진료 내용 <span>선택</span>
              <Input
                value={draft.extraction.diagnosis}
                onChange={(e) =>
                  updateExtraction({ diagnosis: e.target.value })
                }
                placeholder="문서에 적힌 내용을 남겨주세요"
              />
            </label>
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
                    종료일 <span>선택</span>
                    <Input
                      type="date"
                      value={item.endDate}
                      onChange={(e) =>
                        updateItem(i, { endDate: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label className="field-label">먹일 시간</label>
                <div className="time-inputs">
                  {item.times.map((time, j) => (
                    <div key={j}>
                      <Input
                        type="time"
                        value={time}
                        aria-label={`약 ${i + 1} 투약 시간 ${j + 1}`}
                        onChange={(e) =>
                          updateItem(i, {
                            times: item.times.map((t, k) =>
                              k === j ? e.target.value : t,
                            ),
                          })
                        }
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
                      updateItem(i, { times: [...item.times, "12:00"] })
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
              확인하고 기록하기
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
