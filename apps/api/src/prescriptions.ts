import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { logAiFailure } from "./ai-diagnostics";

import {
  decodeDocumentResponse,
  normalizeDocumentExtraction,
  documentInstruction,
  documentResponseSchema,
} from "./document-extraction";

export const prescriptions = new Hono<{ Bindings: ApiBindings }>();
prescriptions.use(
  "*",
  bodyLimit({
    maxSize: 6 * 1024 * 1024,
    onError: (c) =>
      c.json(
        { error: "사진 용량이 너무 커요. 조금 작은 사진으로 다시 올려주세요." },
        413,
      ),
  }),
);
prescriptions.post("/analyze", async (c) => {
  c.header("Cache-Control", "no-store");
  const origin = c.req.header("Origin");
  const url = new URL(c.req.url);
  const localPreview =
    ["127.0.0.1", "localhost"].includes(url.hostname) &&
    ["http://127.0.0.1:4321", "http://localhost:4321"].includes(origin ?? "");
  if (origin && origin !== url.origin && !localPreview)
    return c.json({ error: "이 페이지에서 사진을 다시 올려주세요." }, 403);
  const key = c.req.header("CF-Connecting-IP") || "local";
  if (!(await c.env.AI_LIMITER.limit({ key })).success)
    return c.json(
      { error: "사진을 여러 번 확인하고 있어요. 1분 뒤 다시 올려주세요." },
      429,
    );
  let form: FormData;
  try {
    form = await c.req.formData();
  } catch {
    return c.json({ error: "사진 파일을 올려주세요." }, 400);
  }
  const file = form.get("image");
  const documentKind =
    form.get("documentKind") === "diagnosis" ? "diagnosis" : "prescription";
  if (
    !(file instanceof File) ||
    !file.size ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    return c.json({ error: "JPG, PNG, WebP 사진만 읽을 수 있어요." }, 400);
  const images = [
    file,
    ...[
      form.has("detail1") ? "detail1" : "detailTop",
      form.has("detail2") ? "detail2" : "detailBottom",
    ]
      .map((key) => form.get(key))
      .filter((value): value is File => value instanceof File),
  ];
  const encoded: { type: "image_url"; image_url: { url: string } }[] = [];
  for (const image of images) {
    if (
      !image.size ||
      !["image/jpeg", "image/png", "image/webp"].includes(image.type)
    )
      return c.json({ error: "사진 형식을 확인해 주세요." }, 400);
    const bytes = new Uint8Array(await image.arrayBuffer());
    const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png =
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47;
    const webp =
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
    if (!jpeg && !png && !webp)
      return c.json(
        { error: "사진 형식을 확인하지 못했어요. 다른 사진을 골라주세요." },
        400,
      );
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192)
      binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    encoded.push({
      type: "image_url",
      image_url: { url: `data:${image.type};base64,${btoa(binary)}` },
    });
  }
  let stage: "inference" | "decode" | "validation" = "inference";
  try {
    const result = await c.env.AI.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          { role: "system", content: documentInstruction },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `documentKind: ${documentKind}. 사진에 적힌 진료·처방 정보만 JSON으로 옮겨주세요.`,
              },
              ...encoded,
            ],
          },
        ],
        max_tokens: 3800,
        response_format: {
          type: "json_schema",
          json_schema: documentResponseSchema,
        },
        temperature: 0,
      },
      {
        signal: AbortSignal.timeout(60000),
        gateway: {
          id: c.env.AI_GATEWAY_ID,
          skipCache: true,
          collectLog: false,
          requestTimeoutMs: 55000,
        },
      },
    );
    stage = "decode";
    const parsed = decodeDocumentResponse(result);
    stage = "validation";
    const extraction = normalizeDocumentExtraction(parsed, documentKind);
    return c.json(extraction);
  } catch (error) {
    // Never log source images, extracted health information, or model payloads.
    logAiFailure("prescription", stage, error);
    return c.json({ error: "자동 분석을 완료하지 못했어요." }, 502);
  }
});
