import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Dog,
  FileText,
  Heart,
  Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import "@/styles/landing-demo.css";
export function DocumentOnboarding({
  onUpload,
  onSample,
}: {
  onUpload: () => void;
  onSample: () => void;
}) {
  return (
    <main className="landing">
      <header className="landing-header">
        <a className="wordmark" href="/">
          luvo<span>•</span>
        </a>
        <button onClick={onSample}>
          먼저 둘러보기 <ArrowUpRight size={16} />
        </button>
      </header>
      <aside className="landing-demo" aria-label="AI 시연 안내">
        <span className="landing-demo-icon" aria-hidden="true">
          <Sparkles size={20} />
        </span>
        <div>
          <span className="landing-demo-label">CRENOVA · FIRST AI DEMO</span>
          <p>
            지우 대표님 검토를 위한 <strong>크레노바 첫 AI 시연</strong>
          </p>
        </div>
        <span className="landing-demo-number" aria-hidden="true">01</span>
      </aside>
      <section className="landing-hero">
        <div className="landing-copy">
          <span className="landing-tag">
            <i /> FOR A LONGER, HAPPIER TOGETHER
          </span>
          <h1>
            오래 함께할
            <br />
            우리 사이에,
            <br />
            <span>기록 한 장.</span>
            <i className="hero-asterisk">✳</i>
          </h1>
          <p>
            약 먹인 오늘도, 병원에 다녀온 날도.
            <br />
            작은 기록을 이어 우리 아이의 내일을 준비해요.
          </p>
          <Button size="lg" className="landing-cta" onClick={onUpload}>
            사진 한 장으로 시작하기 <ArrowUpRight size={22} />
          </Button>
          <span className="landing-hint">
            로그인 없이 가볍게 · 기록은 내 브라우저에
          </span>
        </div>
        <div className="landing-visual" aria-label="강아지 건강 기록 미리보기">
          <div className="visual-topline">
            <span>
              A LITTLE CARE,
              <br />A LONGER TOGETHER.
            </span>
            <span>
              LUVO
              <br />
              DAILY CARE
            </span>
          </div>
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="landing-dog">
            <Dog size={130} strokeWidth={1.4} />
            <span className="dog-heart">
              <Heart size={25} fill="currentColor" />
            </span>
          </div>
          <div className="floating-label label-record">
            <span>
              <FileText size={18} />
            </span>
            <div>
              <strong>사진에서 읽고, 기억해요</strong>
              <small>강아지 정보 · 병력 · 처방</small>
            </div>
            <Check size={18} />
          </div>
          <div className="floating-label label-check">
            <span className="preview-check">
              <Check size={19} />
            </span>
            <div>
              <strong>오전 약, 먹였어요</strong>
              <small>오늘의 작은 약속 완료</small>
            </div>
            <span className="mini-time">08:00</span>
          </div>
          <div className="floating-brief">
            <Sparkles size={17} />
            <p>
              쌓인 기록을 연결해,
              <br />
              <strong>다음 변화를 준비해요.</strong>
            </p>
            <ArrowUpRight size={24} />
          </div>
          <span className="visual-caption">작은 기록이 만드는 긴 안심.</span>
        </div>
      </section>
      <div className="landing-ribbon">
        <span>LESS WORRY.</span>
        <i>✳</i>
        <span>MORE TOGETHER.</span>
        <i>✳</i>
        <span>A LITTLE EVERY DAY.</span>
        <i>✳</i>
      </div>
      <section className="landing-how">
        <div className="landing-section-title">
          <span className="eyebrow">아주 작은 습관으로</span>
          <h2>
            챙길 건 줄이고,
            <br />
            함께할 날은 늘리고.
          </h2>
          <ArrowDownRight size={39} />
        </div>
        <div className="landing-steps">
          {[
            {
              icon: FileText,
              n: "01",
              title: "병원에 다녀오면, 사진 한 장",
              text: "진단서·처방전을 올려주세요. 아이의 정보부터 병력과 약까지 읽어 정리해요.",
            },
            {
              icon: CheckCheck,
              n: "02",
              title: "약을 먹인 뒤, 한 번의 체크",
              text: "시간에 맞춰 먹였는지 체크하고, 쉬는 동안에는 토글만 꺼두세요.",
            },
            {
              icon: Sparkles,
              n: "03",
              title: "우리 아이의 다음을 준비해요",
              text: "쌓인 병력을 연결한 짧은 브리핑. 관찰할 변화와 준비할 일을 함께 확인해요.",
            },
          ].map((step) => (
            <article key={step.n}>
              <div>
                <span>{step.n}</span>
                <step.icon size={25} />
              </div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="landing-last">
        <span>
          <Heart size={24} />
        </span>
        <h2>오늘부터 쌓아볼까요?</h2>
        <p>우리 아이의 첫 기록은, 사진 한 장이면 돼요.</p>
        <Button size="lg" onClick={onUpload}>
          첫 진료 기록 남기기 <Plus size={21} />
        </Button>
        <small>
          사진과 건강 기록은 Cloudflare AI로 분석하며,
          <br />
          원본과 결과는 이 브라우저에 저장돼요.
        </small>
      </section>
      <footer className="landing-footer">
        <a className="wordmark" href="/">
          luvo<span>•</span>
        </a>
        <span>작은 기록으로, 오래 함께.</span>
        <span>© {new Date().getFullYear()} LUVO</span>
      </footer>
    </main>
  );
}
