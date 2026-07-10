import Anthropic from "@anthropic-ai/sdk";

/**
 * Diagnóstico TEMPORAL del asistente en producción. No expone la clave: solo
 * informa si está presente, si tiene el formato esperado y si una llamada
 * mínima a Anthropic funciona. Borrar este archivo una vez diagnosticado.
 */
export async function GET() {
  const key = process.env.ANTHROPIC_API_KEY;
  const result: Record<string, unknown> = {
    anthropicKeyPresent: Boolean(key),
    anthropicKeyPrefixOk: key?.startsWith("sk-ant-") ?? false,
    anthropicKeyLength: key?.length ?? 0,
    model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
  };

  if (!key) {
    result.anthropicTest = "sin clave: no se probó";
    return Response.json(result);
  }

  try {
    const client = new Anthropic({ apiKey: key });
    const r = await client.messages.create({
      model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5",
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    result.anthropicTest = "ok";
    result.stopReason = r.stop_reason;
  } catch (error) {
    const e = error as { status?: number; message?: string };
    result.anthropicTest = "error";
    result.errorStatus = e.status ?? null;
    result.errorMessage = (e.message ?? String(error)).slice(0, 300);
  }

  return Response.json(result);
}
