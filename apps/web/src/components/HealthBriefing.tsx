import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  FileText,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { briefingContext, contextHash } from "@/lib/household";
import { compareDocuments, documentDateLabel } from "@/lib/chronology";
import {
  localDate,
  type AppState,
  type DocumentRecord,
  type HealthBriefing,
} from "@/lib/domain";

type Commit = (
  id: string,
  signature: string,
  briefing?: HealthBriefing,
  error?: string,
) => Promise<boolean>;
export function useHealthAnalysis(pet: AppState | null, onCommit: Commit) {
  const [day, setDay] = useState(localDate());
  const [retry, setRetry] = useState(0);
  const handledRetry = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const petRef = useRef(pet);
  petRef.current = pet;
  const signature = pet ? JSON.stringify(briefingContext(pet, day)) : "";
  useEffect(() => {
    const check = () => setDay(localDate());
    const interval = window.setInterval(check, 60000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  useEffect(() => {
    setHash("");
    setError("");
    setLoading(false);
    if (
      !petRef.current?.documents.length ||
      petRef.current.sample ||
      !petRef.current.analysisConsent
    )
      return;
    const petId = petRef.current.id;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const fingerprint = await contextHash(JSON.parse(signature));
      if (cancelled) return;
      setHash(fingerprint);
      const force = retry > handledRetry.current;
      handledRetry.current = retry;
      if (!force && petRef.current?.briefing?.contextHash === fingerprint)
        return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/briefings/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contextHash: fingerprint,
            context: JSON.parse(signature),
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok)
          throw new Error(data.error || "브리핑을 마치지 못했어요.");
        await commit.current(petId, signature, data as HealthBriefing);
      } catch (cause) {
        if (cancelled) return;
        const message =
          cause instanceof Error ? cause.message : "브리핑을 마치지 못했어요.";
        setError(message);
        await commit.current(petId, signature, undefined, message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 1600);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [signature, retry, pet?.id, pet?.analysisConsent]);
  return { loading, error, hash, refresh: () => setRetry((n) => n + 1) };
}
type Analysis = ReturnType<typeof useHealthAnalysis>;
export function HealthBriefingPanel({
  pet,
  compact,
  analysis,
  onDocument,
  onDetails,
  onEnable,
}: {
  pet: AppState;
  compact?: boolean;
  analysis: Analysis;
  onDocument: (doc: DocumentRecord) => void;
  onDetails: () => void;
  onEnable: () => void;
}) {
  const { loading, error, hash } = analysis;
  const brief = pet.briefing;
  const stale = !!brief && !!hash && brief.contextHash !== hash;
  const sourceButtons = (ids: string[]) => (
    <div className="brief-sources">
      {[...new Set(ids)].map((id) => {
        const doc = pet.documents.find((d) => d.id === id);
        return doc ? (
          <button key={id} onClick={() => onDocument(doc)}>
            <FileText size={12} />
            {doc.date.slice(5).replace("-", "/")}
            {doc.time ? ` ${doc.time}` : ""} 진료 기록
          </button>
        ) : null;
      })}
    </div>
  );
  return (
    <section
      className={`health-briefing ${compact ? "compact" : ""}`}
      aria-label={`${pet.profile.name} 건강 브리핑`}
    >
      <div className="brief-heading">
        <span className="brief-spark">
          <Sparkles size={19} />
        </span>
        <div>
          <strong>{pet.profile.name}의 건강 브리핑</strong>
          <small>
            {loading
              ? "새 기록과 이전 병력을 함께 살펴보고 있어요"
              : brief
                ? `${new Date(brief.generatedAt).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })} 기준`
                : "기록이 쌓일 때마다 함께 정리해요"}
          </small>
        </div>
        {loading ? (
          <LoaderCircle className="animate-spin size-18" size={18} />
        ) : (
          <button
            className="subtle-icon"
            onClick={() => analysis.refresh()}
            disabled={!pet.documents.length || pet.sample}
            aria-label="건강 브리핑 다시 분석"
          >
            <RefreshCw size={16} />
          </button>
        )}
      </div>
      {!pet.analysisConsent && !pet.sample ? (
        <div className="brief-empty">
          <p>
            이 강아지의 병력·처방·투약 기록을 Cloudflare AI로 함께 분석할 수
            있어요.
          </p>
          <button className="brief-consent-button" onClick={onEnable}>
            동의하고 건강 브리핑 받기 <ArrowRight size={14} />
          </button>
        </div>
      ) : pet.sample ? (
        <p className="brief-empty">
          샘플 기록이에요. 실제 문서를 올리면 우리 아이의 병력을 분석해 드려요.
        </p>
      ) : brief ? (
        <>
          <p className="brief-summary">{brief.summary}</p>
          {stale && (
            <p className="brief-stale">
              새 기록이 추가되어 다시 분석 중이에요. 아래는 이전 브리핑이에요.
            </p>
          )}
          {!compact && (
            <>
              <h3>기록으로 확인한 현재 상태</h3>
              <div className="brief-current">
                {brief.current.map((item, i) => (
                  <div key={i}>
                    <span>
                      <Check size={15} />
                    </span>
                    <div>
                      <p>{item.text}</p>
                      {sourceButtons(item.sourceIds)}
                    </div>
                  </div>
                ))}
              </div>
              <h3>앞으로 확인할 변화와 준비</h3>
              {brief.watch.length ? (
                brief.watch.map((item, i) => (
                  <article className="watch-card" key={i}>
                    <div className="watch-title">
                      <TriangleAlert size={17} />
                      <strong>{item.title}</strong>
                      <span>가능성 · 확인 필요</span>
                    </div>
                    <p>{item.possibility}</p>
                    <div className="prepare-note">
                      <span>이렇게 준비해요</span>
                      <p>{item.prepare}</p>
                    </div>
                    {sourceButtons(item.sourceIds)}
                    <div className="clinical-links">
                      {item.referenceIds.map((id) => {
                        const reference = brief.references.find(
                          (r) => r.id === id,
                        );
                        return reference ? (
                          <a
                            key={id}
                            href={reference.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {reference.title} ↗
                          </a>
                        ) : null;
                      })}
                    </div>
                  </article>
                ))
              ) : (
                <p className="brief-empty">
                  현재 기록만으로 구체적인 질환·변화 가능성을 판단하기는
                  어려워요.
                </p>
              )}
              {brief.questions.length > 0 && (
                <>
                  <h3>다음 진료에서 물어볼 것</h3>
                  <ul className="brief-questions">
                    {brief.questions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </>
              )}
              {brief.unknowns.length > 0 && (
                <div className="brief-unknowns">
                  <strong>아직 알 수 없는 점</strong>
                  {brief.unknowns.map((u, i) => (
                    <p key={i}>{u}</p>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="brief-empty">
          {loading ? (
            <>
              <div className="brief-skeleton" />
              <div className="brief-skeleton short" />
              <p>진단·처방·투약 이력을 연결하고 있어요.</p>
            </>
          ) : (
            "첫 진료 기록부터 차근차근 분석해 드릴게요."
          )}
        </div>
      )}
      {(error || pet.briefingError) && (
        <p className="brief-error" role="status">
          {error || pet.briefingError}
          <button onClick={() => analysis.refresh()}>다시 분석</button>
        </p>
      )}
      {compact && (
        <button className="brief-details" onClick={onDetails}>
          병력·예상 변화 자세히 보기 <ArrowRight size={15} />
        </button>
      )}
      {!compact && (
        <p className="brief-footnote">
          의학적 확진이나 미래 질병을 보장하는 예측은 아니에요. 현재 기록과 참고
          지침을 바탕으로 상담·관찰할 내용을 정리해요. 앱을 열거나 기록이 바뀌면
          갱신되며, 앱을 닫은 동안에는 분석하지 않아요.
        </p>
      )}
    </section>
  );
}

export function MedicalHistory({
  pet,
  onDocument,
}: {
  pet: AppState;
  onDocument: (doc: DocumentRecord) => void;
}) {
  const records = pet.documents
    .filter((d) => d.diagnosis || d.conditions?.length)
    .toSorted(compareDocuments);
  return (
    <section className="medical-history">
      <div className="section-heading">
        <h2>이어지는 병력</h2>
        <span>{records.length}개 진료</span>
      </div>
      {records.length ? (
        records.map((doc) => (
          <button
            key={doc.id}
            className="medical-event"
            onClick={() => onDocument(doc)}
          >
            <span className="medical-event-date">{documentDateLabel(doc)}</span>
            <div>
              {doc.conditions?.length ? (
                <div className="condition-tags">
                  {doc.conditions.map((c, i) => (
                    <span
                      key={i}
                      className={c.status === "suspected" ? "suspected" : ""}
                    >
                      {c.name}
                      <small>
                        {
                          (
                            {
                              diagnosed: "문서상 진단",
                              suspected: "의심",
                              resolved: "호전·종료 기록",
                              history: "과거 병력",
                            } as const
                          )[c.status]
                        }
                      </small>
                    </span>
                  ))}
                </div>
              ) : null}
              {doc.diagnosis && <p>{doc.diagnosis}</p>}
              <span className="medical-source">
                {doc.clinic || "진료 기록"} · 원본 확인 <ArrowRight size={12} />
              </span>
            </div>
          </button>
        ))
      ) : (
        <p className="tiny-hint">
          진단서·진료 기록이 추가되면 이곳에 병력이 이어져요.
        </p>
      )}
    </section>
  );
}
