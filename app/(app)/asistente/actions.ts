"use server";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { logAiInteraction } from "@/lib/ai-log";
import { runAssistant, type ChatMessage } from "@/lib/assistant";

const RATE_LIMIT_MAX = 15; // consultas
const RATE_LIMIT_WINDOW_MS = 60_000; // por minuto
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 8; // últimos turnos que se reenvían como contexto

export type AskAssistantResult = { reply: string } | { error: string };

async function withinRateLimit(userId: string): Promise<boolean> {
  const count = await prisma.auditLog.count({
    where: {
      actorId: userId,
      action: "assistant.query",
      createdAt: { gte: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) },
    },
  });
  return count < RATE_LIMIT_MAX;
}

export async function askAssistant(
  history: ChatMessage[],
  message: string
): Promise<AskAssistantResult> {
  const user = await requireActiveUser();

  const trimmed = message.trim().slice(0, MAX_MESSAGE_LENGTH);
  if (!trimmed) return { error: "Escribí una consulta." };

  if (!(await withinRateLimit(user.id))) {
    // Registrado también: sirve para ver si el límite molesta en el uso real.
    await logAiInteraction({
      userId: user.id,
      channel: "asistente",
      question: trimmed,
      error: "rate_limit",
    });
    return {
      error:
        "Estás enviando muchas consultas seguidas. Esperá un minuto y volvé a intentar.",
    };
  }

  const startedAt = Date.now();
  try {
    const { reply, toolCalls } = await runAssistant(
      user,
      history.slice(-MAX_HISTORY_MESSAGES),
      trimmed
    );

    await logAudit({
      action: "assistant.query",
      actorId: user.id,
      metadata: {
        message: trimmed,
        tools: toolCalls.map((t) => t.name),
      },
    });
    // Conversación completa (pregunta + respuesta) para la auditoría de uso.
    await logAiInteraction({
      userId: user.id,
      channel: "asistente",
      question: trimmed,
      reply,
      tools: toolCalls.map((t) => t.name),
      durationMs: Date.now() - startedAt,
    });

    return { reply };
  } catch (error) {
    console.error("askAssistant failed:", error);
    await logAiInteraction({
      userId: user.id,
      channel: "asistente",
      question: trimmed,
      error: (error as Error).message || "error desconocido",
      durationMs: Date.now() - startedAt,
    });
    return {
      error: "No pude procesar la consulta. Probá de nuevo en un momento.",
    };
  }
}
