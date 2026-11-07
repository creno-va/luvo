# Luvo

Astro + Hono + Drizzle로 구성한 Cloudflare 기반 웹 서비스 스캐폴딩.

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

## 상태 확인

```sh
curl https://luvo.baro.site/api/health
curl https://luvo.baro.site/api/health/db
```

`/api/health/db`는 Drizzle로 실제 D1 테이블을 조회하며 DB 또는 마이그레이션에 문제가 있으면 503을 반환합니다.
아직 서비스 기능, 인증, 비즈니스 테이블은 구현하지 않았습니다.
비밀값이 필요해지면 로컬은 `apps/api/.dev.vars`, 운영은 `npx wrangler secret put NAME --config apps/api/wrangler.jsonc`를 사용합니다.
