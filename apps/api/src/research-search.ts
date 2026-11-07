import {
  searchSources,
  type ResearchInput,
  type ResearchSource,
} from "./medication-research.ts";

export async function beforeDeadline<T>(
  work: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) throw new Error("Research timeout");
  let abort: () => void = () => {};
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        abort = () => reject(new Error("Research timeout"));
        signal.addEventListener("abort", abort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener("abort", abort);
  }
}
export function researchQueries(
  input: ResearchInput,
  planned: string[] = [],
): string[] {
  const term = input.ingredient || input.productName || input.name;
  const clean = (text: string) =>
    text
      .replace(/site:[^\s]+|\bOR\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
  return [
    ...new Set(
      [
        planned[0] && clean(planned[0]),
        `${term} dogs veterinary medication`,
      ].filter((q): q is string => !!q),
    ),
  ].slice(0, 2);
}
export function selectDrugSources(
  input: ResearchInput,
  planned: string[],
  sources: ResearchSource[],
): ResearchSource[] {
  const identifiers = [
    input.name,
    input.ingredient,
    input.productName,
    planned[1] || "",
  ]
    .flatMap((text) => text.toLowerCase().split(/[^\p{L}]+/u))
    .filter(
      (token) =>
        token.length >= 4 &&
        !/^(dogs?|canine|veterinary|medication|medicine|tablets?|oral|solution|ingredient)$/.test(
          token,
        ),
    );
  const specific = sources.filter((source) =>
    identifiers.some((token) =>
      `${source.title} ${new URL(source.url).pathname}`
        .toLowerCase()
        .includes(token),
    ),
  );
  if (specific.length) sources = specific;
  sources = sources.filter(
    (source) =>
      !/(?:\bcats?\b|\bfeline\b)/i.test(
        `${source.title} ${new URL(source.url).pathname}`,
      ) || /\bdogs?\b|\bcanine\b/i.test(source.title),
  );
  // DailyMed also contains human drug labels. Only explicitly veterinary labels
  // are eligible for this dog's clinical summary.
  sources = sources.filter(
    (source) =>
      !new URL(source.url).hostname.endsWith("dailymed.nlm.nih.gov") ||
      /veterinary|animal drug|for (?:use in |oral use in )?dogs|indicated.{0,180}(?:dogs|canine)/i.test(
        source.description,
      ),
  );
  return sources;
}
type SearchRunner = (
  provider: "exa" | "ceramic",
  query: string,
) => Promise<unknown>;
export async function findResearchSources(
  input: ResearchInput,
  planned: string[],
  run: SearchRunner,
  signal: AbortSignal,
): Promise<{ sources: ResearchSource[]; queries: string[] }> {
  const queries = researchQueries(input, planned);
  const used: string[] = [];
  const payloads: unknown[] = [];
  let successful = 0;
  async function attempt(
    provider: "exa" | "ceramic",
    keywords: string[],
    timeout: number,
  ) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
    const results = await Promise.allSettled(
      keywords.map((query) => {
        used.push(query);
        return beforeDeadline(run(provider, query), deadline);
      }),
    );
    for (const result of results)
      if (
        result.status === "fulfilled" &&
        result.value &&
        typeof result.value === "object" &&
        Array.isArray((result.value as { items?: unknown }).items)
      ) {
        successful++;
        payloads.push(result.value);
      }
  }
  await attempt("exa", queries, 12000);
  let sources = selectDrugSources(input, planned, searchSources(payloads));
  if (!sources.some((s) => s.description.trim())) {
    // Use one identifier, rather than requiring a brand + generic + site match.
    const term = input.ingredient || input.productName || input.name;
    const english = planned[1]?.trim();
    await attempt(
      "ceramic",
      [`site:vcahospitals.com ${english || term}`.slice(0, 350)],
      8000,
    );
    sources = selectDrugSources(input, planned, searchSources(payloads));
  }
  if (!successful) throw new Error("Search providers unavailable");
  return { sources: sources.slice(0, 4), queries: [...new Set(used)] };
}
