import { prisma } from "@/lib/prisma";

/**
 * Registro de interacciones con la IA (AssistantLog): pregunta, respuesta,
 * herramientas, error y duración. Sirve para auditar el uso real (preguntas
 * habituales, fallas) y mejorar el asistente. Nunca rompe la operación que
 * lo llama: si el log falla, se anota en consola y la respuesta sigue.
 */

export type AiChannel = "asistente" | "mapa.estrategia" | "mapa.prospectos";

const MAX_QUESTION = 2000;
const MAX_REPLY = 8000;
const MAX_ERROR = 500;

export async function logAiInteraction(input: {
  userId?: string | null;
  channel: AiChannel;
  question?: string | null;
  reply?: string | null;
  tools?: string[];
  error?: string | null;
  durationMs?: number;
}): Promise<void> {
  try {
    await prisma.assistantLog.create({
      data: {
        userId: input.userId ?? null,
        channel: input.channel,
        question: input.question?.slice(0, MAX_QUESTION) ?? null,
        reply: input.reply?.slice(0, MAX_REPLY) ?? null,
        tools: input.tools ?? [],
        error: input.error?.slice(0, MAX_ERROR) ?? null,
        durationMs: input.durationMs,
      },
    });
  } catch (error) {
    console.error("logAiInteraction failed:", error);
  }
}
