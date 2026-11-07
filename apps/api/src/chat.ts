import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { parseAiResponse } from "./ai-response";
import { logAiFailure } from "./ai-diagnostics";
import {
  chatInput,
  chatInstruction,
  checkedReply,
  isCurrentEmergency,
  emergencyReply,
  allowedChatOrigin,
} from "./chat-policy";

export const chat = new Hono<{
  Bindings: ApiBindings & { ALLOW_LOCAL_CHAT?: string };
}>();
chat.use(
  "*",
  bodyLimit({
    maxSize: 260_000,
    onError: (c) =>
      c.json(
        { error: "질문과 참고 기록이 너무 많아요. 질문을 조금 줄여주세요." },
        413,
      ),
  }),
);
chat.post("/", async (c) => {
  c.header("Cache-Control", "no-store");
  if (
    !allowedChatOrigin(
      c.req.header("Origin"),
      c.req.url,
      c.env.ALLOW_LOCAL_CHAT === "true",
    )
  )
    return c.json({ error: "Luvo에서 다시 질문해 주세요." }, 403);
  const parsed = chatInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return c.json(
      { error: "질문과 선택한 강아지의 기록을 확인해 주세요." },
      400,
    );
  const input = parsed.data;
  if (isCurrentEmergency(input.messages.at(-1)!.content))
    return c.json(emergencyReply());
  if (
    !(
      await c.env.CHAT_LIMITER.limit({
        key: c.req.header("CF-Connecting-IP") || "local",
      })
    ).success
  )
    return c.json(
      { error: "질문을 여러 번 보내고 있어요. 1분 뒤 다시 보내주세요." },
      429,
    );
  let stage: "inference" | "decode" | "validation" = "inference";
  try {
    const [first, ...rest] = input.messages;
    const result = await c.env.AI.run(
      "@cf/meta/llama-4-scout-17b-16e-instruct",
      {
        messages: [
          { role: "system", content: chatInstruction },
          {
            role: "user",
            content: JSON.stringify({
              context: input.context,
              question: first.content,
            }),
          },
          ...rest,
        ],
        max_tokens: 1800,
        temperature: 0.2,
        response_format: { type: "json_object" },
      },
      {
        signal: AbortSignal.timeout(50000),
        gateway: {
          id: c.env.AI_GATEWAY_ID,
          skipCache: true,
          collectLog: false,
          requestTimeoutMs: 45000,
        },
      },
    );
    stage = "decode";
    const decoded = parseAiResponse(result);
    stage = "validation";
    return c.json(checkedReply(decoded, input));
  } catch (error) {
    logAiFailure("chat", stage, error);
    return c.json(
      {
        error: "답변을 마치지 못했어요. 질문은 저장돼 있어요. 다시 보내주세요.",
      },
      502,
    );
  }
});
