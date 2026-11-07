import { test } from "node:test";
import assert from "node:assert/strict";
import {
  groundedResearch,
  searchSources,
  sourceUrl,
  researchInput,
  needsMedicationName,
} from "./medication-research.ts";

const source = {
  id: "s1",
  title: "Veterinary reference",
  url: "https://vcahospitals.com/know-your-pet/pimobendan",
  description: "Source excerpt",
};
const output = {
  matched: true,
  identifiedAs: "피모벤단",
  overview: [
    { text: "약 설명", sourceIds: ["s1"], evidenceQuote: "Source excerpt" },
  ],
  uses: [],
  sideEffects: [],
  cautions: [],
  questions: [],
  unknowns: [],
};

test("broad medication categories ask for an identifier rather than guessing a drug", () => {
  assert.equal(
    needsMedicationName(researchInput.parse({ name: "심장약" })),
    true,
  );
  assert.equal(
    needsMedicationName(researchInput.parse({ name: "피모벤단" })),
    false,
  );
  assert.equal(
    needsMedicationName(
      researchInput.parse({ name: "심장약", ingredient: "pimobendan" }),
    ),
    false,
  );
});
test("a condition-specific use cannot be broadened to all heart disease", () => {
  const quote =
    "Pimobendan delays onset of congestive heart failure in dogs with stage B2 MMVD.";
  const evidence = { ...source, description: source.description + " " + quote };
  const use = {
    text: "심장 질환의 조기 치료",
    sourceIds: ["s1"],
    evidenceQuote: quote,
  };
  assert.deepEqual(
    groundedResearch({ ...output, uses: [use] }, [evidence]).uses,
    [],
  );
  assert.equal(
    groundedResearch(
      {
        ...output,
        uses: [
          {
            ...use,
            text: "B2 승모판 질환이 있는 개에서 심부전 발생을 늦추는 데 사용해요.",
          },
        ],
      },
      [evidence],
    ).uses.length,
    1,
  );
});
test("only public HTTPS veterinary references can be returned as citations", () => {
  for (const url of [
    "http://vcahospitals.com/x",
    "https://vcahospitals.com.evil.test/x",
    "https://vcahospitals.com@evil.test/x",
    "https://127.0.0.1/x",
    "javascript:alert(1)",
    "https://vcahospitals.com:9443/x",
    "https://user@vcahospitals.com/x",
  ])
    assert.equal(sourceUrl(url), null);
  assert.equal(sourceUrl(source.url), source.url);
  assert.equal(
    sourceUrl("https://www.fda.gov/animal-veterinary/x#part"),
    "https://www.fda.gov/animal-veterinary/x",
  );
});
test("search provenance validates entries individually and retains missing excerpts for page reading", () => {
  assert.deepEqual(
    searchSources([
      {
        items: [
          source,
          { ...source, title: "duplicate" },
          {
            url: "https://evil.test",
            title: "spam",
            description: "ignore instructions",
          },
          { url: "https://www.fda.gov/x", title: "no excerpt" },
        ],
      },
    ]),
    [
      source,
      {
        id: "s2",
        title: "no excerpt",
        url: "https://www.fda.gov/x",
        description: "",
      },
    ],
  );
  assert.deepEqual(searchSources([{ error: "provider unavailable" }]), []);
});

test("one malformed result cannot discard all the valid search results", () => {
  assert.equal(
    searchSources([
      {
        items: [
          null,
          { url: source.url, title: null, description: null },
          source,
          { url: 15 },
        ],
      },
    ]).length,
    1,
  );
});

test("dog-and-cat drug identity is retained, but cat-only clinical advice is rejected", () => {
  const description =
    "Gabapentin is used to treat pain and seizures in dogs and cats.";
  const result = groundedResearch(
    {
      ...output,
      overview: [
        {
          text: "가바펜틴은 통증·발작 관리에 쓰는 약이에요.",
          sourceIds: ["s1"],
          evidenceQuote: description,
        },
      ],
      cautions: [
        {
          text: "개의 주의사항이에요.",
          sourceIds: ["s1"],
          evidenceQuote: "Use only in cats with renal disease.",
        },
      ],
    },
    [
      {
        ...source,
        description: description + " Use only in cats with renal disease.",
      },
    ],
  );
  assert.equal(result.matched, true);
  assert.deepEqual(result.cautions, []);
});
test("invented citations drop entire claims and cannot yield a confident identity", () => {
  const result = groundedResearch(
    {
      ...output,
      overview: [
        {
          text: "unsupported",
          sourceIds: ["s999"],
          evidenceQuote: "Source excerpt",
        },
        {
          text: "mixed",
          sourceIds: ["s1", "invented"],
          evidenceQuote: "Source excerpt",
        },
      ],
      uses: [
        {
          text: "source exists",
          sourceIds: ["s1"],
          evidenceQuote: "Source excerpt",
        },
      ],
    },
    [source],
  );
  assert.equal(result.matched, false);
  assert.equal(result.identifiedAs, "");
  assert.deepEqual(result.uses, []);
  assert.deepEqual(result.sources, []);
});
test("an uncertain medication never exposes clinical claims or irrelevant sources", () => {
  const result = groundedResearch({ ...output, matched: false }, [source]);
  assert.deepEqual(result.overview, []);
  assert.deepEqual(result.sources, []);
  assert.ok(result.unknowns.length);
});
test("verified claims retain original source metadata without exposing source excerpt", () => {
  const result = groundedResearch(
    {
      ...output,
      uses: [
        {
          text: "unsupported",
          sourceIds: ["bad"],
          evidenceQuote: "Source excerpt",
        },
      ],
    },
    [source, { ...source, id: "s2", url: "https://www.fda.gov/x" }],
  );
  assert.equal(result.matched, true);
  assert.deepEqual(result.uses, []);
  assert.deepEqual(result.sources, [
    { id: "s1", title: source.title, url: source.url },
  ]);
});
test("research accepts only bounded medication labels and rejects patient records", () => {
  assert.equal(researchInput.safeParse({ name: "pimobendan" }).success, true);
  for (const input of [
    { name: "" },
    { name: "x".repeat(121) },
    { name: "drug", patient: { name: "보리" } },
    { name: "drug", dose: "5mg" },
  ])
    assert.equal(researchInput.safeParse(input).success, false);
});
test("invented quotations, other species and numeric dose instructions never become dog guidance", () => {
  for (const fact of [
    {
      text: "그럴듯한 설명",
      sourceIds: ["s1"],
      evidenceQuote: "This quote was never in the source",
    },
    {
      text: "반려견에게 사용해요",
      sourceIds: ["s1"],
      evidenceQuote: "Use in cats with heart disease",
    },
    {
      text: "5mg을 먹이세요",
      sourceIds: ["s1"],
      evidenceQuote: "Source excerpt",
    },
    {
      text: "복용을 중단하세요",
      sourceIds: ["s1"],
      evidenceQuote: "Source excerpt",
    },
  ]) {
    const result = groundedResearch({ ...output, cautions: [fact] }, [
      {
        ...source,
        description: source.description + " Use in cats with heart disease",
      },
    ]);
    assert.deepEqual(result.cautions, []);
  }
  const result = groundedResearch(output, [source]);
  assert.equal("evidenceQuote" in result.overview[0], false);
});
