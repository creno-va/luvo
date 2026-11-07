import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beforeDeadline,
  findResearchSources,
  researchQueries,
  selectDrugSources,
} from "./research-search.ts";
const input = {
  name: "피모벤단",
  ingredient: "pimobendan",
  productName: "Vetmedin",
};
const found = {
  items: [
    {
      url: "https://vcahospitals.com/know-your-pet/pimobendan",
      title: "Pimobendan",
      description: "Pimobendan is a heart medication for dogs.",
    },
  ],
};
const signal = () => new AbortController().signal;
test("queries use one useful identifier rather than requiring every brand spelling", () => {
  assert.deepEqual(researchQueries(input), [
    "pimobendan dogs veterinary medication",
  ]);
  assert.ok(
    researchQueries(input, ["site:fda.gov pimobendan OR dogs"])[0].includes(
      "pimobendan dogs",
    ),
  );
});
test("a failed query does not discard successful search results", async () => {
  const result = await findResearchSources(
    input,
    ["english query", "pimobendan"],
    async (_, q) => {
      if (q === "english query") throw new Error("offline");
      return found;
    },
    signal(),
  );
  assert.equal(result.sources[0].title, "Pimobendan");
});
test("zero results and malformed responses fall back to a second provider", async () => {
  for (const unavailable of [{ items: [] }, { error: "unavailable" }]) {
    const providers: string[] = [];
    const result = await findResearchSources(
      input,
      [],
      async (provider, q) => {
        providers.push(provider);
        if (provider === "exa") return unavailable;
        assert.equal(q, "site:vcahospitals.com pimobendan");
        return found;
      },
      signal(),
    );
    assert.deepEqual(providers, ["exa", "ceramic"]);
    assert.equal(result.sources.length, 1);
  }
});
test("provider failure is distinguished from a genuinely empty search", async () => {
  await assert.rejects(
    findResearchSources(
      input,
      [],
      async () => {
        throw new Error("offline");
      },
      signal(),
    ),
    /unavailable/,
  );
  assert.deepEqual(
    (
      await findResearchSources(
        input,
        [],
        async () => ({ items: [] }),
        signal(),
      )
    ).sources,
    [],
  );
});
test("a stalled search observes its deadline", async () => {
  const controller = new AbortController();
  const work = beforeDeadline(new Promise(() => {}), controller.signal);
  controller.abort();
  await assert.rejects(work, /timeout/);
});
test("a medication monograph is preferred over generic disease pages and human or cat-only labels", () => {
  const source = {
    id: "s1",
    title: "Gabapentin",
    url: "https://vcahospitals.com/know-your-pet/gabapentin",
    description: "Used in dogs and cats.",
  };
  const selected = selectDrugSources(
    { name: "가바펜틴", ingredient: "", productName: "" },
    ["Gabapentin dogs medication", "gabapentin"],
    [
      source,
      {
        ...source,
        id: "s2",
        title: "Psychotropic agents in animals",
        url: "https://www.msdvetmanual.com/pharmacology/psychotropic-agents",
      },
      {
        ...source,
        id: "s3",
        title: "Gabapentin for cats",
        url: "https://vcahospitals.com/know-your-pet/gabapentin-for-cats",
      },
      {
        ...source,
        id: "s4",
        url: "https://dailymed.nlm.nih.gov/dailymed/gabapentin",
        description: "Gabapentin tablets for human use.",
      },
    ],
  );
  assert.deepEqual(
    selected.map((s) => s.id),
    ["s1"],
  );
});
