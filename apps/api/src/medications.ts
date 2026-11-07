import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { parseAiResponse } from "./ai-response";
import { enrichSources } from "./research-pages";
import { allowedChatOrigin } from "./chat-policy";
import { beforeDeadline, findResearchSources } from "./research-search";
import {
  researchInput,
  needsMedicationName,
  groundedResearch,
  plannerInstruction,
  summaryInstruction,
  type ResearchSource,
} from "./medication-research";

export const medications = new Hono<{
  Bindings: ApiBindings & { ALLOW_LOCAL_CHAT?: string };
}>();
medications.use(
  "*",
  bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ error: "약 이름을 짧게 입력해 주세요." }, 413),
  }),
);
const emptyResult = () => ({
  matched: false,
  identifiedAs: "",
  overview: [],
  uses: [],
  sideEffects: [],
  cautions: [],
  questions: [],
  unknowns: [] as string[],
});
const references = (sources: ResearchSource[]) =>
  sources.map(({ description: _, ...source }) => source);
function report(stage: string, error: unknown) {
  console.error(
    JSON.stringify({
      feature: "medication-research",
      stage,
      code: "research_failed",
      timeout:
        error instanceof Error &&
        /timeout|timed out|abort/i.test(error.message),
      issues:
        error instanceof z.ZodError
          ? error.issues.map((issue) => ({
              path: issue.path.join("."),
              code: issue.code,
            }))
          : undefined,
    }),
  );
}
medications.post("/research", async (c) => {
  c.header("Cache-Control", "no-store");
  if (
    !allowedChatOrigin(
      c.req.header("Origin"),
      c.req.url,
      c.env.ALLOW_LOCAL_CHAT === "true",
    )
  )
    return c.json({ error: "Luvo에서 다시 검색해 주세요." }, 403);
  const parsed = researchInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json(
      { error: "처방전의 약 이름이나 성분명을 입력해 주세요." },
      400,
    );
  const input = parsed.data;
  if (needsMedicationName(input))
    return c.json({
      ...emptyResult(),
      status: "not_found",
      unknowns: [
        "약의 종류만으로는 정확한 성분을 확인할 수 없어요. 처방전에 적힌 약 이름·제품명·성분명으로 검색해 주세요.",
      ],
      sources: [],
      searchedAt: new Date().toISOString(),
      queries: [],
    });
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      JSON.stringify(input).normalize("NFKC").toLowerCase(),
    ),
  );
  const key = [...new Uint8Array(digest)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
  const cacheKey = new Request(
    new URL(`/__medication-research/v2/${key}`, c.req.url),
  );
  if (c.req.header("Cache-Control") !== "no-cache") {
    const cached = await caches.default.match(cacheKey);
    if (cached) return c.json(await cached.json());
  }
  if (
    !(
      await c.env.RESEARCH_LIMITER.limit({
        key: c.req.header("CF-Connecting-IP") || "local",
      })
    ).success
  )
    return c.json({ error: "잠시 쉬었다가 1분 뒤 다시 검색해 주세요." }, 429);
  const signal = AbortSignal.timeout(65000);
  const gateway = {
    id: c.env.AI_GATEWAY_ID,
    skipCache: true,
    collectLog: false,
    requestTimeoutMs: 25000,
  };
  let stage = "search";
  try {
    let planned: string[] = [];
    const identifier = input.ingredient || input.productName || input.name;
    // English ingredient names already work as direct queries. Translation is
    // optional: a planner failure must never prevent the actual web search.
    if (/[가-힣]/.test(identifier)) {
      try {
        const planSignal = AbortSignal.any([signal, AbortSignal.timeout(8000)]);
        const plan = await beforeDeadline(
          c.env.AI.run(
            "@cf/meta/llama-4-scout-17b-16e-instruct",
            {
              messages: [
                { role: "system", content: plannerInstruction },
                { role: "user", content: JSON.stringify(input) },
              ],
              max_tokens: 300,
              temperature: 0,
              response_format: { type: "json_object" },
            },
            {
              gateway: { ...gateway, requestTimeoutMs: 7000 },
              signal: planSignal,
            },
          ),
          planSignal,
        );
        planned = z
          .object({
            queries: z.array(z.string().trim().min(2).max(350)).min(1).max(2),
          })
          .parse(parseAiResponse(plan)).queries;
      } catch {
        /* Search the original label when translation is unavailable. */
      }
    }
    const found = await findResearchSources(
      input,
      planned,
      async (provider, query) => {
        const response = await c.env.AI.websearch({
          gatewayId: c.env.AI_GATEWAY_ID,
          provider,
          query,
          limit: 6,
        });
        if (!response.ok) throw new Error("Search provider unavailable");
        return response.json();
      },
      signal,
    );
    const { queries } = found;
    const metadata = { searchedAt: new Date().toISOString(), queries };
    if (!found.sources.length)
      return c.json({
        ...emptyResult(),
        status: "not_found",
        unknowns: [
          "이 이름으로 확인할 수 있는 수의학 자료를 찾지 못했어요. 성분명이나 정확한 제품명으로 다시 검색해 주세요.",
        ],
        sources: [],
        ...metadata,
      });
    stage = "pages";
    const sources = [
      ...(await enrichSources(found.sources.slice(0, 2), signal)),
      ...found.sources.slice(2),
    ];
    const referenceResult = (unknowns: string[]) => ({
      ...emptyResult(),
      status: "references_only",
      unknowns,
      sources: references(sources),
      ...metadata,
    });
    stage = "summary";
    try {
      let grounded: ReturnType<typeof groundedResearch> | undefined;
      for (let attempt = 0; attempt < 2; attempt++) {
        stage = attempt ? "summary-retry" : "summary";
        try {
          const summarySources = sources
            .slice(0, attempt ? 1 : 2)
            .map((source) => ({
              ...source,
              description: source.description.slice(0, attempt ? 3500 : 5000),
            }));
          const summarySignal = AbortSignal.any([
            signal,
            AbortSignal.timeout(attempt ? 23000 : 28000),
          ]);
          const result = await beforeDeadline(
            c.env.AI.run(
              "@cf/meta/llama-4-scout-17b-16e-instruct",
              {
                messages: [
                  {
                    role: "system",
                    content:
                      summaryInstruction +
                      (attempt
                        ? "\n아주 짧게 재시도합니다. overview 1개, uses 1개, sideEffects 1개, cautions 1개까지만 허용하며 근거가 없으면 빈 배열로 둡니다. questions와 unknowns는 []로 둡니다."
                        : ""),
                  },
                  {
                    role: "user",
                    content: JSON.stringify({
                      medication: input,
                      sources: summarySources,
                    }),
                  },
                ],
                max_tokens: attempt ? 1200 : 1600,
                temperature: 0,
                response_format: { type: "json_object" },
              },
              {
                gateway: {
                  ...gateway,
                  requestTimeoutMs: attempt ? 20000 : 25000,
                },
                signal: summarySignal,
              },
            ),
            summarySignal,
          );
          stage = "validation";
          const decoded = parseAiResponse(result);
          grounded = groundedResearch(decoded, summarySources);
          if ((decoded as { matched?: boolean }).matched && !grounded.matched)
            throw new Error("Unverified summary citations");
          break;
        } catch (error) {
          if (attempt || signal.aborted) throw error;
          report(stage, error);
        }
      }
      if (!grounded) throw new Error("Missing summary");
      if (!grounded.matched)
        return c.json(
          referenceResult([
            "검색 자료는 찾았지만 이 약과의 일치 여부를 충분히 확인하지 못했어요. 아래 원문과 처방전의 성분명을 대조해 주세요.",
          ]),
        );
      const data = { ...grounded, status: "complete", ...metadata };
      c.executionCtx.waitUntil(
        caches.default.put(
          cacheKey,
          new Response(JSON.stringify(data), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=3600",
            },
          }),
        ),
      );
      return c.json(data);
    } catch (error) {
      report(stage, error);
      return c.json(
        referenceResult([
          "웹 자료는 찾았지만 자동 요약을 마치지 못했어요. 아래 원문을 먼저 확인하거나 다시 정리해 주세요.",
        ]),
      );
    }
  } catch (error) {
    report(stage, error);
    return c.json(
      {
        error:
          "검색 서비스에 연결하지 못했어요. 약 이름은 입력창에 남아 있어요. 잠시 후 다시 검색해 주세요.",
      },
      503,
    );
  }
});
