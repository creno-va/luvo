import { useEffect, useRef, useState, type SubmitEvent } from "react";
import {
  ArrowLeft,
  ArrowUp,
  ArrowUpRight,
  Dog,
  FileText,
  LoaderCircle,
  MessageCircle,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { uid, type AppState } from "@/lib/domain";
import {
  chatContext,
  chatReply,
  chatReferences,
  conversationHistory,
  type ChatMessage,
} from "@/lib/chat";
import { readConversation, writeConversation } from "@/lib/storage";

function visibleViewport(node: HTMLDivElement | null) {
  if (!node) return;
  const viewport = window.visualViewport;
  const update = () => {
    node.style.height = `${viewport?.height ?? innerHeight}px`;
    node.style.top = `${viewport?.offsetTop ?? 0}px`;
  };
  update();
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  return () => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
  };
}

export function DogChat({
  pet,
  onBack,
  onRecord,
}: {
  pet: AppState;
  onBack: () => void;
  onRecord: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const busy = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const context = chatContext(pet);
  const unanswered = messages.at(-1)?.role === "user";
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    setReady(false);
    setError("");
    void readConversation(pet.id)
      .then((stored) => {
        if (!alive) return;
        setMessages(stored);
        setReady(true);
        if (stored.at(-1)?.role === "user")
          setError(
            "마지막 질문의 답변이 완료되지 않았어요. 다시 보내 이어갈 수 있어요.",
          );
      })
      .catch(() => {
        if (alive) setError("저장된 대화를 열지 못했어요. 다시 시도해 주세요.");
      });
    return () => {
      alive = false;
    };
  }, [pet.id, reload]);
  useEffect(() => {
    bottom.current?.scrollIntoView({
      block: "end",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }, [messages.length, pending, error]);

  async function send(question = draft, retry = false) {
    const text = question.trim();
    if (busy.current || !ready || (!retry && (!text || text.length > 2000)))
      return;
    busy.current = true;
    setPending(true);
    setError("");
    let timer: number | undefined;
    try {
      const submit = async () => {
        const stored = await readConversation(pet.id);
        let next: ChatMessage[];
        if (retry) {
          if (stored.at(-1)?.role !== "user") {
            if (mounted.current) setMessages(stored);
            return;
          }
          next = stored;
        } else {
          if (stored.at(-1)?.role === "user") {
            if (mounted.current) setMessages(stored);
            throw new Error(
              "마지막 질문의 답변이 완료되지 않았어요. 다시 보내 이어가 주세요.",
            );
          }
          next = [
            ...stored,
            {
              id: uid(),
              role: "user",
              content: text,
              createdAt: new Date().toISOString(),
            },
          ];
          await writeConversation(pet.id, next);
        }
        if (!mounted.current) return;
        setMessages(next);
        setDraft("");
        const controller = new AbortController();
        request.current = controller;
        timer = window.setTimeout(() => controller.abort(), 60000);
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: chatContext(pet),
            messages: conversationHistory(next),
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "답변을 받지 못했어요.",
          );
        const reply = chatReply(data);
        const completed: ChatMessage[] = [
          ...next,
          {
            id: uid(),
            role: "assistant",
            content: reply.answer,
            createdAt: new Date().toISOString(),
            recordIds: reply.recordIds,
            referenceIds: reply.referenceIds,
            followUps: reply.followUps,
            urgent: reply.urgent,
          },
        ];
        await writeConversation(pet.id, completed);
        if (mounted.current) {
          setMessages(completed);
          setError("");
        }
      };
      if (navigator.locks) {
        await navigator.locks.request(
          `luvo-chat:${pet.id}`,
          { ifAvailable: true },
          async (lock) => {
            if (!lock)
              throw new Error(
                "다른 창에서 이 아이의 답변을 받고 있어요. 잠시 뒤 다시 열어주세요.",
              );
            await submit();
          },
        );
      } else await submit();
    } catch (cause) {
      if (mounted.current)
        setError(
          request.current?.signal.aborted
            ? "답변이 오래 걸리고 있어요. 질문은 저장됐으니 다시 보내주세요."
            : cause instanceof Error
              ? cause.message
              : "대화를 이어가지 못했어요. 다시 시도해 주세요.",
        );
    } finally {
      if (timer !== undefined) window.clearTimeout(timer);
      request.current = null;
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  }
  const prompts = [
    "최근 건강 기록을 쉽게 정리해 줘",
    "다음 진료에 어떤 기록을 가져갈까?",
    "먹는 약에 대해 병원에 무엇을 물어볼까?",
  ];
  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    void send();
  };
  return (
    <div className="dog-chat" ref={visibleViewport}>
      <header className="chat-header">
        <button
          className="chat-back"
          onClick={onBack}
          aria-label="질문하기 나가기"
        >
          <ArrowLeft size={22} />
        </button>
        <span className="chat-dog">
          <Dog size={24} />
        </span>
        <div>
          <span className="eyebrow">ASK LUVO</span>
          <h1>{pet.profile.name} 질문하기</h1>
        </div>
        <span className="chat-context-tag">
          {pet.sample
            ? "샘플 기록"
            : `기록 ${Math.min(context.recordCount, 40)}개 참고`}
        </span>
      </header>
      <main
        className="chat-scroll"
        aria-label={`${pet.profile.name}에 대한 대화`}
      >
        {!ready && !error && (
          <p className="chat-loading" role="status">
            <LoaderCircle size={18} className="animate-spin" />
            대화를 불러오고 있어요
          </p>
        )}
        {ready && !messages.length && (
          <section className="chat-welcome">
            <span className="chat-welcome-icon">
              <MessageCircle size={32} />
              <Sparkles size={18} />
            </span>
            <p className="eyebrow">A LITTLE QUESTION, A LITTLE CARE</p>
            <h2>
              우리 아이에 대해
              <br />
              궁금한 걸 물어보세요.
            </h2>
            <p>
              {pet.profile.name}의 건강 기록과 복용약을 함께 살펴볼게요.
              {context.recordCount > 40 ? " 최근 40개 기록을 참고해요." : ""}
            </p>
            <div className="chat-prompts">
              {prompts.map((q) => (
                <button key={q} disabled={pending} onClick={() => void send(q)}>
                  {q}
                  <ArrowUpRight size={17} />
                </button>
              ))}
            </div>
            <small>
              질문과 참고 기록은 Cloudflare AI로 분석해요.
              <br />
              대화는 강아지별로 이 브라우저에 저장돼요.
            </small>
          </section>
        )}
        <div className="chat-messages">
          {messages.map((message) => (
            <article
              className={`chat-message chat-${message.role}`}
              key={message.id}
              aria-label={message.role === "user" ? "나의 질문" : "Luvo 답변"}
            >
              <span className="chat-message-role">
                {message.role === "assistant" ? (
                  <>
                    <Sparkles size={13} />
                    LUVO
                  </>
                ) : (
                  "나"
                )}
              </span>
              <div
                className={`chat-bubble ${message.urgent ? "chat-bubble-urgent" : ""}`}
              >
                {message.urgent && (
                  <strong className="chat-urgent">
                    <TriangleAlert size={17} />
                    지금은 병원에 먼저 연락해 주세요
                  </strong>
                )}
                <p>{message.content}</p>
                {!!message.recordIds?.length && (
                  <div className="chat-records" aria-label="참고한 건강 기록">
                    {message.recordIds.map((id) => {
                      const record = pet.documents.find((d) => d.id === id);
                      return record ? (
                        <button key={id} onClick={() => onRecord(id)}>
                          <FileText size={13} />
                          {record.date}{" "}
                          {record.source === "manual"
                            ? "직접 입력"
                            : "진료 기록"}
                          <ArrowUpRight size={12} />
                        </button>
                      ) : null;
                    })}
                  </div>
                )}
                {message.referenceIds?.map((id) => {
                  const reference = chatReferences.find((r) => r.id === id);
                  return reference ? (
                    <a
                      key={id}
                      className="chat-reference"
                      href={reference.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {reference.title}
                      <ArrowUpRight size={12} />
                    </a>
                  ) : null;
                })}
              </div>
              <time>
                {new Date(message.createdAt).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                })}
              </time>
            </article>
          ))}
        </div>
        {pending && (
          <div className="chat-thinking" role="status">
            <Sparkles size={16} />
            <span>{pet.profile.name}의 기록을 살펴보고 있어요</span>
            <i />
            <i />
            <i />
          </div>
        )}
        {error && (
          <div className="chat-error" role="alert">
            <p>{error}</p>
            <button
              disabled={pending}
              onClick={() =>
                !ready ? setReload((v) => v + 1) : void send(draft, unanswered)
              }
            >
              <RefreshCw size={14} />
              {unanswered ? "다시 보내기" : "다시 시도"}
            </button>
          </div>
        )}
        {!pending && !error && messages.at(-1)?.role === "assistant" && (
          <div className="chat-followups">
            {messages.at(-1)?.followUps?.map((q) => (
              <button key={q} onClick={() => void send(q)}>
                {q}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        )}
        <div ref={bottom} />
      </main>
      <footer className="chat-footer">
        <form onSubmit={submit} className="chat-composer">
          <textarea
            aria-label={`${pet.profile.name}에 대해 질문하기`}
            value={draft}
            rows={2}
            maxLength={2000}
            disabled={!ready || pending || unanswered}
            placeholder={
              unanswered
                ? "위 질문의 답변을 다시 받을 수 있어요"
                : "궁금한 점을 편하게 물어보세요"
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="submit"
            aria-label="질문 보내기"
            disabled={!ready || pending || unanswered || !draft.trim()}
          >
            {pending ? (
              <LoaderCircle size={20} className="animate-spin" />
            ) : (
              <ArrowUp size={23} />
            )}
          </button>
        </form>
        <p>
          AI 답변은 진료를 대신하지 않아요.<span>{draft.length}/2,000</span>
        </p>
      </footer>
    </div>
  );
}
