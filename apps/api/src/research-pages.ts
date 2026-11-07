import { sourceUrl, type ResearchSource } from "./medication-research";

// Read only search-discovered veterinary references. Validate every redirect,
// cap the response body, and fall back to the original excerpt on blocked pages.
export async function enrichSources(
  sources: ResearchSource[],
  signal: AbortSignal,
): Promise<ResearchSource[]> {
  const enriched = await Promise.all(
    sources.slice(0, 3).map(async (source) => {
      try {
        let url = source.url;
        for (let redirects = 0; redirects <= 2; redirects++) {
          const response = await fetch(url, {
            redirect: "manual",
            signal: AbortSignal.any([signal, AbortSignal.timeout(7000)]),
            headers: { Accept: "text/html" },
          });
          if (response.status >= 300 && response.status < 400) {
            const next = sourceUrl(
              new URL(response.headers.get("Location") || "", url).href,
            );
            await response.body?.cancel();
            if (!next) return source;
            url = next;
            continue;
          }
          if (
            !response.ok ||
            !response.headers.get("Content-Type")?.includes("text/html")
          ) {
            await response.body?.cancel();
            return source;
          }
          if (Number(response.headers.get("Content-Length")) > 512000) {
            await response.body?.cancel();
            return source;
          }
          const reader = response.body?.getReader();
          if (!reader) return source;
          const chunks: Uint8Array[] = [];
          let size = 0;
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 512000) {
                await reader.cancel();
                return source;
              }
              chunks.push(value);
            }
          } finally {
            reader.releaseLock();
          }
          const html = new Uint8Array(size);
          let offset = 0;
          for (const chunk of chunks) {
            html.set(chunk, offset);
            offset += chunk.length;
          }
          let text = "";
          const parsed = new HTMLRewriter()
            .on("script,style,nav,footer,header,noscript,form", {
              element(element) {
                element.remove();
              },
            })
            .on(
              'main,article,[role="main"],.mainbody,[itemprop="articleBody"],.article-body,.article-content',
              {
                text(chunk) {
                  if (text.length < 20000) text += chunk.text;
                },
                element(element) {
                  element.onEndTag(() => {
                    text += "\n";
                  });
                },
              },
            )
            .transform(
              new Response(html, {
                headers: { "Content-Type": "text/html;charset=utf-8" },
              }),
            );
          await parsed.arrayBuffer();
          text = text
            .replace(/[\t ]+/g, " ")
            .replace(/\n\s*\n/g, "\n")
            .trim()
            .slice(0, 14000);
          return text.length > 400
            ? {
                ...source,
                description: `Search excerpt: ${source.description}\n\nFetched page text: ${text}`,
                evidenceKind: "page" as const,
              }
            : source;
        }
      } catch {
        /* Search excerpts remain usable when a publisher blocks reading. */
      }
      return source;
    }),
  );
  return [...enriched, ...sources.slice(3)];
}
