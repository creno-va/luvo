# Luvo

처방전 사진과 시간대별 투약 체크로 건강 기록을 남기는 강아지 케어 프로토타입.

로그인 없이 기록과 원본 사진을 브라우저 IndexedDB에 저장합니다. 약별 토글은 미복용 기간을 기록하며, 처방 이력과 실제 투약 체크를 따로 유지합니다. 첫 화면의 **샘플로 둘러보기**로 기능을 체험할 수 있습니다.

- UI: Astro + React, Pretendard 자체 호스팅, Lucide, shadcn 패턴의 Radix UI 컴포넌트와 Tailwind CSS.
- 레이아웃: 데스크톱은 왼쪽 탐색·오늘 투약·약 요약, 모바일은 하단 탐색과 한 열의 체크 목록.
- 사진: JPG/PNG/WebP, 원본 최대 12MB. 분석용으로 크기를 조정하여 Hono API → Cloudflare AI Gateway → Workers AI로 전송합니다.
- 읽힌 처방이 명확하면 자동 반영하고, 불명확한 날짜·용량·투약 시간은 확인받습니다. 분석 실패 시 원본과 함께 직접 입력할 수 있습니다.
- 샘플과 실제 기록은 섞지 않습니다. 첫 실제 문서 등록 시 샘플을 정리합니다.
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
npm test          # 처방 이력, 미복용 기간, 회차별 체크의 도메인 테스트
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
개발 중에도 사진 분석은 원격 Workers AI를 호출하므로 Wrangler 로그인이 필요합니다.
분석 요청은 Gateway 캐시와 로그 수집을 끄며, API는 사진·추출 결과를 로그로 남기지 않습니다.
분석 API에는 IP별 분당 5회 제한을 적용했습니다. 모델 결과는 원본과 비교하여 수정할 수 있습니다.
비밀값이 필요해지면 로컬은 `apps/api/.dev.vars`, 운영은 `npx wrangler secret put NAME --config apps/api/wrangler.jsonc`를 사용합니다.
