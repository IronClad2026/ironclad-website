import { NextRequest, NextResponse } from "next/server";
import { translateMatchChatMessage, validateMatchChatTranslations } from "@/app/tournaments/chat-translation-actions";

const MAX_BODY_BYTES = 4096;
const HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function failure(status: number) {
  return NextResponse.json({ ok: false, code: "invalid_request" }, { status, headers: HEADERS });
}

/** Independent HTTP transport: slow translations never enter chat's action queue. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin ||
    request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") return failure(403);
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return failure(413);
  if (!request.body) return failure(400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let text = "", bytes = 0;
  let input: unknown;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) { await reader.cancel(); return failure(413); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    input = JSON.parse(text + decoder.decode());
  } catch {
    return failure(400);
  } finally {
    reader.releaseLock();
  }
  if (input === null || typeof input !== "object" || Array.isArray(input) ||
    Object.keys(input).some((key) => key !== "operation" && key !== "input")) return failure(400);
  const body = input as Record<string, unknown>;
  if (body.operation !== "validate" && body.operation !== "translate") return failure(400);
  // These server-only functions repeat Clerk authentication, validate the full
  // scope and authorize the saved original, including every cached response.
  const result = body.operation === "validate" ? await validateMatchChatTranslations(body.input) : await translateMatchChatMessage(body.input);
  return NextResponse.json(result, { headers: HEADERS });
}
