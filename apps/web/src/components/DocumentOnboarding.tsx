import {
  Camera,
  Check,
  Dog,
  FileText,
  Heart,
  LockKeyhole,
  Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";

export function DocumentOnboarding({
  onUpload,
  onSample,
}: {
  onUpload: () => void;
  onSample: () => void;
}) {
  return (
    <main className="document-onboarding">
      <header>
        <a href="/" className="brand">
          <span className="brand-mark">
            <Dog size={25} />
          </span>
          luvo<span className="brand-period">.</span>
        </a>
        <span>
          <LockKeyhole size={13} />
          로그인 없이 시작해요
        </span>
      </header>
      <div className="onboarding-layout">
        <section className="onboarding-copy">
          <span className="soft-tag">우리 아이의 평생 건강 기록</span>
          <h1>
            첫 기록은,
            <br />
            사진 한 장이면 돼요.
          </h1>
          <p>
            병원에서 받은 진단서나 처방전을 찍어주세요.
            <br />
            우리 아이 정보부터 약과 병력까지 정리해 드릴게요.
          </p>
          <Button size="lg" onClick={onUpload}>
            <Camera size={21} />
            진단서·처방전 찍어서 시작하기
          </Button>
          <div className="onboarding-privacy">
            <LockKeyhole size={14} />
            <span>
              기록은 이 브라우저에 남아요. 사진 분석만 Cloudflare AI를 이용해요.
            </span>
          </div>
          <button className="sample-link" onClick={onSample}>
            먼저 샘플로 둘러볼게요 →
          </button>
        </section>
        <section
          className="onboarding-preview"
          aria-label="문서로 시작하는 건강 관리"
        >
          <div className="onboarding-paper">
            <span>
              <FileText size={20} />
              진단서 · 처방전
            </span>
            <div className="preview-line long" />
            <div className="preview-line" />
            <div className="preview-line medium" />
          </div>
          <div className="onboarding-auto">
            <span>
              <Sparkles size={15} />
              사진에서 읽고, 한 번에 정리해요
            </span>
            <div>
              <i>
                <Dog size={22} />
              </i>
              <p>
                <strong>강아지 기본 정보</strong>
                <small>이름 · 품종 · 성별 · 나이</small>
              </p>
              <Check size={17} />
            </div>
            <div>
              <i>
                <FileText size={22} />
              </i>
              <p>
                <strong>처방과 쌓이는 병력</strong>
                <small>진단 · 약 · 먹일 시간</small>
              </p>
              <Check size={17} />
            </div>
            <div>
              <i>
                <Heart size={22} />
              </i>
              <p>
                <strong>기록을 연결한 건강 브리핑</strong>
                <small>현재 상태 · 확인할 변화 · 준비할 일</small>
              </p>
              <Check size={17} />
            </div>
          </div>
        </section>
      </div>
      <section className="onboarding-steps">
        <div>
          <b>01</b>
          <strong>병원에 다녀오면, 사진 한 장</strong>
          <p>
            다른 강아지의 문서도 올려주세요.
            <br />
            아이별로 나누어 기억해요.
          </p>
        </div>
        <div>
          <b>02</b>
          <strong>약을 먹인 뒤, 한 번의 체크</strong>
          <p>
            먹일 시간과 복용 여부를 확인하며
            <br />
            매일의 기록을 쌓아요.
          </p>
        </div>
        <div>
          <b>03</b>
          <strong>쌓인 병력으로, 짧은 브리핑</strong>
          <p>
            이전 기록과 새 기록을 연결해
            <br />
            앞으로 확인할 내용을 정리해요.
          </p>
        </div>
      </section>
      <footer>
        작은 기록으로, 오래 함께. <span>luvo.</span>
      </footer>
    </main>
  );
}
