import { useEffect, useId, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  Globe2,
  LoaderCircle,
  Pill,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import type { PrescriptionItem } from "@/lib/domain";

type Fact = { text: string; sourceIds: string[] };
type Research = {
  status?: "complete" | "references_only" | "not_found";
  matched: boolean;
  identifiedAs: string;
  overview: Fact[];
  uses: Fact[];
  sideEffects: Fact[];
  cautions: Fact[];
  questions: string[];
  unknowns: string[];
  sources: { id: string; title: string; url: string; evidenceKind?: "page" }[];
  searchedAt: string;
  queries: string[];
};
const cache = new Map<string, { at: number; data: Research }>();
export function MedicationResearch({
  medication,
  onBack,
}: {
  medication: PrescriptionItem;
  onBack: () => void;
}) {
  const initial =
    medication.ingredient || medication.productName || medication.name;
  const [input, setInput] = useState(initial);
  const [search, setSearch] = useState({
    name: medication.name,
    ingredient: medication.ingredient || "",
    productName: medication.productName || "",
    version: 0,
  });
  const [data, setData] = useState<Research | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inputId = useId();
  useEffect(() => {
    const { version, ...payload } = search;
    const key = JSON.stringify(payload);
    const cached = cache.get(key);
    setError("");
    setData(null);
    if (version === 0 && cached && Date.now() - cached.at < 3600000) {
      setData(cached.data);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("timeout")),
      75000,
    );
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch("/api/medications/research", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(version > 0 ? { "Cache-Control": "no-cache" } : {}),
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error || "약 정보를 가져오지 못했어요.");
        if (
          !Array.isArray(result.sources) ||
          ![
            "overview",
            "uses",
            "sideEffects",
            "cautions",
            "questions",
            "unknowns",
            "queries",
          ].every((key) => Array.isArray(result[key])) ||
          typeof result.matched !== "boolean"
        )
          throw new Error("결과를 정리하지 못했어요. 다시 검색해 주세요.");
        if (alive) {
          setData(result);
          if (result.matched) {
            if (cache.size >= 40) cache.delete(cache.keys().next().value!);
            cache.set(key, { at: Date.now(), data: result });
          }
        }
      } catch (cause) {
        if (alive)
          setError(
            controller.signal.aborted
              ? "검색이 오래 걸리고 있어요. 다시 시도해 주세요."
              : cause instanceof Error
                ? cause.message
                : "검색을 완료하지 못했어요.",
          );
      } finally {
        clearTimeout(timeout);
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [search]);
  const retry = () => setSearch((s) => ({ ...s, version: s.version + 1 }));
  const citations = (ids: string[]) => (
    <span className="research-citations">
      {ids.map((id) => {
        const source = data?.sources.find((s) => s.id === id);
        return source ? (
          <a
            key={id}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`출처: ${source.title}`}
          >
            {data!.sources.indexOf(source) + 1}
            <ArrowUpRight size={10} />
          </a>
        ) : null;
      })}
    </span>
  );
  const section = (
    title: string,
    caption: string,
    facts: Fact[],
    kind: string,
  ) =>
    facts.length ? (
      <section className={`research-section research-${kind}`}>
        <span className="eyebrow">{caption}</span>
        <h2>{title}</h2>
        <ul>
          {facts.map((fact, i) => (
            <li key={i}>
              <span className="research-dot" />
              <div>
                {fact.text}
                {citations(fact.sourceIds)}
              </div>
            </li>
          ))}
        </ul>
      </section>
    ) : null;
  return (
    <div className="research-page">
      <header className="research-header">
        <button
          onClick={onBack}
          className="back-button"
          aria-label="약 리스트로 돌아가기"
        >
          <ArrowLeft size={22} />
        </button>
        <span>약 정보 살펴보기</span>
        <Globe2 size={19} />
      </header>
      <div className="research-hero">
        <span className="research-label">
          <Sparkles size={13} /> AI WEB RESEARCH
        </span>
        <div className="research-drug">
          <span>
            <Pill size={28} />
          </span>
          <h1>{search.name}</h1>
        </div>
        <p>
          궁금했던 이 약,
          <br />웹 자료에서 핵심만 살펴봐요.
        </p>
      </div>
      <form
        className="research-search"
        onSubmit={(e) => {
          e.preventDefault();
          const value = input.trim();
          if (
            !value ||
            (loading &&
              value ===
                (search.ingredient || search.productName || search.name))
          )
            return;
          setSearch(
            value === initial
              ? {
                  name: medication.name,
                  ingredient: medication.ingredient || "",
                  productName: medication.productName || "",
                  version: search.version + 1,
                }
              : {
                  name: value,
                  ingredient: "",
                  productName: "",
                  version: search.version + 1,
                },
          );
        }}
      >
        <label htmlFor={inputId}>약 이름 · 성분명</label>
        <div>
          <Search size={19} />
          <input
            id={inputId}
            value={input}
            maxLength={120}
            onChange={(e) => setInput(e.target.value)}
            placeholder="정확한 약 이름이나 성분명"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={
              !input.trim() ||
              (loading &&
                input.trim() ===
                  (search.ingredient || search.productName || search.name))
            }
            aria-label="약 정보 검색"
          >
            {loading &&
            input.trim() ===
              (search.ingredient || search.productName || search.name) ? (
              <LoaderCircle size={19} className="animate-spin" />
            ) : (
              <ArrowUpRight size={21} />
            )}
          </button>
        </div>
        <small>
          처방전에 적힌 이름으로 검색하면 더 정확해요.
          {loading ? " 다른 이름을 입력하면 지금 검색을 바꿀 수 있어요." : ""}
        </small>
      </form>
      <div aria-live="polite" aria-busy={loading}>
        {loading ? (
          <section className="research-loading">
            <div className="research-orbit">
              <Globe2 size={30} />
              <Sparkles size={17} />
            </div>
            <h2>자료를 찾아 읽고 있어요</h2>
            <p>
              수의학 자료에서 약을 확인하고
              <br />
              알아둘 내용을 짧게 정리해요.
            </p>
            <div className="research-skeleton" />
            <div className="research-skeleton short" />
            <span>
              <LoaderCircle size={13} className="animate-spin" /> 잠시만 기다려
              주세요
            </span>
          </section>
        ) : error ? (
          <section className="research-empty">
            <BookOpen size={30} />
            <h2>이번 검색은 마치지 못했어요</h2>
            <p role="alert">{error}</p>
            <Button variant="outline" onClick={retry}>
              <RefreshCw size={16} />
              다시 검색
            </Button>
          </section>
        ) : data ? (
          <>
            <div className="research-meta">
              <span>
                {data.matched ? <Check size={14} /> : <Search size={14} />}
                {data.matched
                  ? "웹 자료 확인"
                  : data.status === "references_only"
                    ? "검색 자료 · 일치 여부 확인 필요"
                    : "약 이름 확인 필요"}
              </span>
              <time dateTime={data.searchedAt}>
                {new Date(data.searchedAt).toLocaleDateString("ko-KR", {
                  month: "long",
                  day: "numeric",
                })}{" "}
                조회
              </time>
            </div>
            {data.matched ? (
              <>
                <section className="research-summary">
                  <span className="eyebrow">먼저, 이 약은요</span>
                  <h2>{data.identifiedAs}</h2>
                  {data.overview.map((fact, i) => (
                    <p key={i}>
                      {fact.text}
                      {citations(fact.sourceIds)}
                    </p>
                  ))}
                </section>
                {section(
                  "어떤 때 쓰는 약인가요",
                  "GENERAL USES",
                  data.uses,
                  "uses",
                )}
                {section(
                  "이런 반응을 살펴봐요",
                  "WHAT TO WATCH",
                  data.sideEffects,
                  "effects",
                )}
                {section(
                  "알아두면 좋은 주의사항",
                  "GOOD TO KNOW",
                  data.cautions,
                  "cautions",
                )}
              </>
            ) : (
              <section className="research-empty">
                <Search size={30} />
                <h2>
                  {data.status === "references_only"
                    ? "확인할 웹 자료를 찾았어요"
                    : "이름을 조금 더 알려주세요"}
                </h2>
                <p>
                  {data.status === "references_only"
                    ? "아래 원문과 약 이름을 먼저 대조해 주세요. 자동 요약은 다시 시도할 수 있어요."
                    : "성분이나 제품이 확인되어야 이 약에 맞는 정보를 정리할 수 있어요."}
                </p>
              </section>
            )}
            {data.unknowns.length > 0 && (
              <div className="research-unknowns">
                <strong>아직 확인하지 못한 내용</strong>
                <ul>
                  {data.unknowns.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.questions.length > 0 && (
              <section className="research-questions">
                <BookOpen size={20} />
                <h2>다음 진료 때 물어보세요</h2>
                <ul>
                  {data.questions.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </section>
            )}
            {data.sources.length > 0 && (
              <details className="research-sources" open>
                <summary>
                  <span>
                    참고한 웹 자료 <b>{data.sources.length}</b>
                  </span>
                  <ChevronDown size={18} />
                </summary>
                <p>
                  {data.matched
                    ? "웹 검색 결과와 확인 가능한 원문으로 정리했어요."
                    : "검색으로 찾은 자료예요. 입력한 약과 같은 성분·제품인지 확인해 주세요."}
                  <br />
                  전체 내용은 원문에서 확인해 주세요.
                </p>
                <ol>
                  {data.sources.map((source, i) => (
                    <li key={source.id}>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        <div>
                          <strong>{source.title}</strong>
                          <small>
                            {new URL(source.url).hostname} ·{" "}
                            {source.evidenceKind === "page"
                              ? "원문 확인"
                              : "검색 발췌"}
                          </small>
                        </div>
                        <ArrowUpRight size={18} />
                      </a>
                    </li>
                  ))}
                </ol>
                <details>
                  <summary>검색한 키워드</summary>
                  <ul>
                    {data.queries.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </details>
              </details>
            )}
            <button className="research-refresh" onClick={retry}>
              <RefreshCw size={14} />
              웹에서 다시 확인하기
            </button>
          </>
        ) : null}
      </div>
      <footer className="research-footer">
        <ShieldCheck size={17} />
        <p>
          약 이름과 성분만 검색해요. 아이의 병력은 보내지 않아요.
          <br />
          일반적인 참고 정보예요. 복용량·중단·변경은 처방한 수의사와 확인해
          주세요.
        </p>
      </footer>
    </div>
  );
}
