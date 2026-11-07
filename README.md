# Luvo

사진 업로드 또는 직접 입력으로 건강 기록을 남기고, 강아지별 병력과 투약 이력을 연결해 AI 건강 브리핑을 제공하는 프로토타입.

로그인 없이 기록과 원본 사진을 브라우저 IndexedDB에 저장합니다. 약별 토글은 미복용 기간을 기록하며, 처방 이력과 실제 투약 체크를 따로 유지합니다. 첫 화면에서 문서를 촬영·업로드하면 강아지 이름·품종·성별·문서상 나이와 약·병력을 필드에 채우고, 사용자가 확인하면 등록합니다. 선택적으로 샘플을 체험할 수도 있습니다.

- 건강 기록 추가: 하단 버튼에서 진단서·처방전 사진을 올리거나 사진 없이 직접 입력합니다. 직접 입력은 강아지·날짜·건강 메모와 선택적 약 정보로 저장하며, 기존 강아지의 기본 정보는 다시 입력하지 않습니다. 직접 기록은 타임라인·상세·브리핑에서 출처를 구별하고 원본 사진 누락 오류를 표시하지 않습니다.
- 여러 강아지: 문서 속 환자 정보로 기존 기록과 연결하거나 새 강아지를 등록합니다. 이름이 겹치거나 정보가 충돌하면 사용자가 선택합니다. 약·병력·투약 체크·브리핑은 강아지별로 분리합니다.
- 건강 브리핑: 동의한 강아지의 문서·병력·투약 기록이 바뀌면 다시 분석합니다. 앱을 열어둔 동안 날짜가 바뀌거나 다음 날 재접속해도 갱신합니다. 변경 없는 결과는 재사용하며 직접 다시 분석할 수도 있습니다. **브라우저를 닫은 동안에는 분석하지 않습니다.**
- 근거: 현재 상태는 진료 문서 링크를, 미래의 확인할 변화는 문서와 지정된 수의학 참고 지침 링크를 함께 표시합니다. 확진·예측 확률·처방 변경 지시는 제공하지 않습니다.
- 기존 기록: 브라우저 단일 강아지 기록을 여러 강아지 구조로 자동 이전하며 원본 사진과 투약 체크를 보존합니다.
- 진료 타임라인: 업로드 시간이 아닌 확인한 서류 날짜로 정렬합니다. 진료 시각은 입력·추출하지 않으며 같은 날 문서의 선후관계는 추정하지 않습니다. 날짜가 불명확하면 확인받고 업로드 시각은 원본 정보로만 따로 보관합니다.
- UI: Astro + React, 형광 초록색 primary, Paperlogy(날짜·제목·주요 수치) + Pretendard(본문) 자체 호스팅, Lucide, shadcn 패턴의 Radix UI 컴포넌트와 Tailwind CSS.
- 레이아웃: 모바일은 브리핑 → 예상 변화·대응 → 약별 토글·투약 체크 → 최근 타임라인 순서의 한 화면입니다. 날짜는 캘린더 바텀시트, 강아지 목록과 전체 타임라인은 URL과 뒤로 가기를 지원하는 별도 화면입니다. 데스크톱에서는 브리핑과 투약·최근 기록을 두 열로 배치합니다.
- 업로드: 하단 고정 버튼 → 처방전·진단서 개별 사진 슬롯 → 한 번에 정리. 체크박스 없이 분석 안내를 표시하며, 두 문서는 차례로 분석·저장합니다. 한 문서 저장 후 다음 문서에서 실패해도 저장된 기록은 남습니다.
- 기간: 전체 타임라인에서 문서상 병력 기록 범위, 처방 변경별 기간, 겹치는 복용 쉼 기간을 구분합니다. 실제 발병일이나 복용 사실을 추정하지 않습니다.
- 사진: JPG/PNG/WebP, 원본 최대 12MB. 분석용으로 크기를 조정하여 Hono API → Cloudflare AI Gateway → Workers AI로 전송합니다.
- 표준 진단서·처방전의 라벨과 기입 값을 구분해 읽고, 인식 결과는 항상 필드를 채운 확인 화면을 거칩니다. 동물명/보호자 성명, 진단·처방일/발급일, 1회 용량/판매 수량/처방일수를 구분합니다. 원본 사진과 비교하며 필요한 값과 병력만 확인한 뒤 저장합니다. 동물 종류·생년월일·병원명·진료 시각·진단서 상세·처방 상태·복용 안내·약별 시작/종료일은 입력·AI 추출·문서 저장 스키마에서 제외합니다.
- 세로·가로 문서는 전체와 겹치는 확대 구역을 함께 분석하고 작은 글자는 가능한 PNG로 보존합니다. 빈 양식·잘린 표는 값을 발명하지 않고 확인을 요청합니다. 하루 횟수로 시각을 만들지 않으며, 발급일을 사용한 기록에는 기준을 표시합니다. 분석 실패 시 원본과 함께 직접 입력할 수 있습니다.
- 샘플과 실제 기록은 섞지 않습니다. 첫 실제 문서 등록 시 샘플을 정리합니다.
- 투약 시간은 `HH:mm` 24시간제 텍스트 입력입니다. 숫자 키패드의 `2000`은 `20:00`으로 표시합니다. 일정은 확인한 서류 날짜와 명시된 처방일수로 연결하며 없는 시간·일수는 만들지 않습니다.
- 직접 입력은 문서 인식 API를 호출하지 않고 파일 없이 저장합니다. 건강 브리핑은 별도 기존 흐름으로 갱신하며 보호자의 관찰을 확진 근거로 사용하지 않습니다.
- 브라우저 저장 형식 v3으로 이전하면서 기존 투약 기간·중단·쉼·체크 및 원본 사진의 키를 유지합니다.
- 브라우저 데이터 삭제 시 기록도 삭제되며 기기 간 동기화는 없습니다.

```text
apps/web      Astro 정적 웹 + API 게이트웨이 Worker (luvo-web)
apps/api      Hono API Worker (luvo-api)
packages/db   Drizzle 스키마, D1 클라이언트, SQL 마이그레이션
```

## 인프라

- 웹: https://luvo.baro.site — Cloudflare Workers Static Assets
- API: https://luvo.baro.site/api — 웹 Worker에서 Service Binding으로 전달
- DB: Cloudflare D1 `luvo-db` (생성 위치: APAC), API의 `DB` 바인딩
- `luvo-api`는 Service Binding으로 접근하며 별도 공개 도메인은 없습니다.
- Wrangler 설정: `apps/web/wrangler.jsonc`, `apps/api/wrangler.jsonc`
- Astro는 정적 빌드이므로 SSR 어댑터 없이 Workers에 배포합니다.

## 로컬 개발

Node.js 22.23.4 이상과 npm이 필요합니다. 이 저장소는 npm workspaces를 사용합니다.

```sh
npm ci
npm run cf:typegen
npm run db:migrate:local
npm run dev
```

웹은 http://127.0.0.1:4321, API는 http://127.0.0.1:8787에서 실행됩니다.
Astro 개발 서버는 `/api` 요청을 로컬 Hono Worker로 전달합니다.
개발, 미리보기, 로컬 마이그레이션은 루트의 `.wrangler/state`를 공유합니다.
로컬 D1과 원격 D1은 별개이며 로컬 개발은 운영 DB를 사용하지 않습니다.

```sh
npm run check     # Wrangler 바인딩 타입 생성 + 전체 타입 검사
npm test          # 강아지별 격리, 처방·투약 이력, 브리핑 근거 검증
npm run build     # Astro 정적 빌드
npm run preview   # 두 Worker를 Wrangler에서 함께 실행 (4321 포트)
```

## DB 스키마 변경

`packages/db/src/schema.ts`를 수정한 뒤 다음 명령을 실행합니다.

```sh
npm run db:generate
npm run db:migrate:local
npm run db:migrate:remote
```

생성된 `packages/db/migrations/`의 SQL과 `meta/` 파일을 함께 커밋합니다.
Drizzle은 스키마와 SQL 생성을, Wrangler는 D1 마이그레이션 적용을 담당합니다.
초기 `app_metadata` 테이블은 연결 확인을 위한 최소 스키마입니다.

## 배포

최초 배포는 현재 Wrangler 로그인 계정에 설정되어 있습니다.
다른 계정으로 옮길 때는 두 Wrangler 설정의 `account_id`와 D1 ID를 교체합니다.

```sh
npx wrangler whoami
npm run deploy
```

전체 배포는 검사 → 웹 빌드 → 원격 D1 마이그레이션 → API → 웹 순서입니다.
개별 배포는 `npm run deploy:api`, `npm run deploy:web`를 사용합니다.
Custom Domain 설정에 따라 Wrangler가 `luvo.baro.site`의 DNS와 인증서를 관리합니다.
`baro.site`가 같은 Cloudflare 계정의 활성 Zone이어야 합니다.

## CI/CD

`main`에 push하면 `.github/workflows/deploy.yml`이 다음 순서로 운영 배포합니다.
GitHub Actions의 **Deploy production → Run workflow**에서도 `main` 배포를 수동 실행할 수 있습니다.

1. 잠금 파일 기준 의존성 설치 (`npm ci`)
2. 전체 타입 검사 및 Drizzle 스키마와 커밋된 마이그레이션의 일치 여부 확인
3. 임시 로컬 D1에 마이그레이션을 적용하여 SQL 검증
4. Astro 웹 빌드
5. 운영 D1에 아직 적용하지 않은 마이그레이션 적용
6. Hono API Worker → Astro 웹 Worker 순서로 배포
7. 운영 웹, API 상태, Drizzle을 통한 D1 연결 확인 (`npm run smoke`)

검증이나 마이그레이션이 실패하면 이후 배포 단계는 실행하지 않습니다.
운영 배포는 직렬 실행하며, 새 push가 진행 중인 마이그레이션/배포를 취소하지 않습니다.
배포 실패 시 이미 적용된 DB 마이그레이션은 자동 롤백하지 않습니다.
스키마 변경은 기존 API와도 호환되게 추가하고, 컬럼 삭제 등의 제거 작업은 별도 배포로 진행합니다.

### 배포 인증

저장소 **Settings → Secrets and variables → Actions**에 다음 Repository secret이 필요합니다.

- `CLOUDFLARE_API_TOKEN`: 운영 배포 전용 Cloudflare API 토큰

토큰은 현재 Cloudflare 계정으로 범위를 제한하고, 다음 권한을 설정합니다.

- Account → Workers Scripts → Edit
- Account → D1 → Edit
- Zone → Workers Routes → Edit (`baro.site`만 포함)
- Zone → Zone → Read (`baro.site`만 포함)

계정 ID와 D1 ID는 각 Wrangler 설정을 사용하며, 토큰은 소스에 저장하지 않습니다.
토큰을 교체할 때는 GitHub의 `CLOUDFLARE_API_TOKEN` secret을 갱신합니다.
마이그레이션 파일은 로컬에서 생성하여 SQL과 `meta/`를 함께 커밋해야 합니다.
CI에서는 운영용 마이그레이션을 자동 생성하지 않습니다.

## 상태 확인

```sh
curl https://luvo.baro.site/api/health
curl https://luvo.baro.site/api/health/db
npm run smoke
```

`/api/health/db`는 Drizzle로 실제 D1 테이블을 조회하며 DB 또는 마이그레이션에 문제가 있으면 503을 반환합니다.
건강 기록은 D1·R2에 저장하지 않습니다. D1은 기존 연결 확인용으로 유지합니다.
AI는 `apps/api/wrangler.jsonc`의 AI 바인딩과 `AI_GATEWAY_ID`(현재 `default`)를 사용합니다.
Workers AI가 JSON을 문자열 또는 이미 파싱된 객체로 반환하는 경우를 모두 처리하며, 결과는 기능별 Zod 스키마로 검증합니다.
`npm run ai:setup`으로 Wrangler 로그인에 연결된 원격 AI 바인딩을 통해 실제 추론을 검증합니다. `default` Gateway가 없으면 첫 인증 요청에서 자동 생성됩니다. 별도 공급자 API 키나 Gateway 관리용 토큰은 필요하지 않습니다.
이 명령은 짧은 테스트 문장만 전송하며 캐시·Gateway 로그 수집을 끕니다. [Cloudflare의 기본 Gateway 생성 동작](https://developers.cloudflare.com/ai-gateway/configuration/manage-gateway/)을 사용합니다.
개발 중에도 사진 분석은 원격 Workers AI를 호출하므로 Wrangler 로그인이 필요합니다.
분석 요청은 Gateway 캐시와 로그 수집을 끄며, API는 사진·추출 결과를 로그로 남기지 않습니다.
분석 실패 시에는 기능명과 실패 단계(`inference`, `decode`, `validation`, `grounding`), 시간 초과 여부, 숫자 HTTP 상태만 기록합니다. `npx wrangler tail --config apps/api/wrangler.jsonc`으로 확인할 수 있으며 원문·모델 응답·오류 전문은 기록하지 않습니다.
사진 분석은 IP별 분당 5회, 병력 브리핑은 분당 6회로 제한합니다. 모델 결과는 원본과 비교하여 수정할 수 있습니다.
비밀값이 필요해지면 로컬은 `apps/api/.dev.vars`, 운영은 `npx wrangler secret put NAME --config apps/api/wrangler.jsonc`를 사용합니다.
