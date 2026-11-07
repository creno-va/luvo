import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { parseAiResponse } from "./ai-response";
import { enrichSources } from "./research-pages";
import {
  researchInput,
  researchOutput,
  searchSources,
  groundedResearch,
  plannerInstruction,
  summaryInstruction,
} from "./medication-research";

export const medications = new Hono<{ Bindings: ApiBindings }>();
medications.use(
  "*",
  bodyLimit({
    maxSize: 4096,
    onError: (c) => c.json({ error: "약 이름을 짧게 입력해 주세요." }, 413),
  }),
);
medications.post("/research", async (c) => {
  c.header("Cache-Control", "no-store");
  const origin = c.req.header("Origin");
  const url = new URL(c.req.url);
  const preview =
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    ["http://localhost:4321", "http://127.0.0.1:4321"].includes(origin ?? "");
  if (origin && origin !== url.origin && !preview)
    return c.json({ error: "Luvo에서 다시 검색해 주세요." }, 403);
  const input = researchInput.safeParse(await c.req.json().catch(() => null));
  if (!input.success)
    return c.json(
      { error: "처방전의 약 이름이나 성분명을 입력해 주세요." },
      400,
    );
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
  let stage = "plan";
  try {
    const plan = await c.env.AI.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          { role: "system", content: plannerInstruction },
          { role: "user", content: JSON.stringify(input.data) },
        ],
        max_tokens: 400,
        temperature: 0,
        response_format: { type: "json_object" },
      },
      { gateway, signal },
    );
    const queries = [
      ...new Set(
        z
          .object({
            queries: z.array(z.string().trim().min(3).max(350)).min(1).max(2),
          })
          .parse(parseAiResponse(plan)).queries,
      ),
    ];
    stage = "search";
    const pendingSearches = Promise.all(
      queries.map(async (query) => {
        const response = await c.env.AI.websearch({
          gatewayId: c.env.AI_GATEWAY_ID,
          provider: "ceramic",
          query,
          limit: 6,
        });
        if (!response.ok) throw new Error("Search provider unavailable");
        return response.json();
      }),
    );
    const searches = await Promise.race([
      pendingSearches,
      new Promise<never>((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("timeout")), {
          once: true,
        }),
      ),
    ]);
    const sources = await enrichSources(searchSources(searches), signal);
    if (!sources.length)
      return c.json({
        matched: false,
        identifiedAs: "",
        overview: [],
        uses: [],
        sideEffects: [],
        cautions: [],
        questions: [],
        unknowns: [
          "이 이름으로 확인할 수 있는 수의학 자료를 찾지 못했어요. 성분명이나 정확한 제품명으로 다시 검색해 주세요.",
        ],
        sources: [],
        searchedAt: new Date().toISOString(),
        queries,
      });
    stage = "summary";
    const result = await c.env.AI.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          { role: "system", content: summaryInstruction },
          {
            role: "user",
            content: JSON.stringify({ medication: input.data, sources }),
          },
        ],
        max_tokens: 3000,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "medication_research",
            schema: z.toJSONSchema(researchOutput),
          },
        },
      },
      { gateway, signal },
    );
    stage = "validation";
    return c.json({
      ...groundedResearch(parseAiResponse(result), sources),
      searchedAt: new Date().toISOString(),
      queries,
    });
  } catch (error) {
    // No prescription label, health record, provider payload or credentials in logs.
    console.error(
      JSON.stringify({
        feature: "medication-research",
        stage,
        code: "research_failed",
        issues:
          error instanceof z.ZodError
            ? error.issues.map((issue) => ({
                path: issue.path.join("."),
                code: issue.code,
              }))
            : undefined,
      }),
    );
    return c.json(
      {
        error:
          stage === "search"
            ? "웹 자료를 가져오지 못했어요. 잠시 후 다시 검색해 주세요."
            : "약 정보를 정리하지 못했어요. 잠시 후 다시 검색해 주세요.",
      },
      502,
    );
  }
});
