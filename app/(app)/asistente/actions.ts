"use server";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { runAssistant, type ChatMessage } from "@/lib/assistant";

const RATE_LIMIT_MAX = 15; // consultas
const RATE_LIMIT_WINDOW_MS = 60_000; // por minuto
const MAX_MESSAGE_LENGTH = 2000;
const MAX_HISTORY_MESSAGES = 12; // últimos turnos que se reenvían como contexto

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
    return {
      error:
        "Estás enviando muchas consultas seguidas. Esperá un minuto y volvé a intentar.",
    };
  }

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

    return { reply };
  } catch (error) {
    console.error("askAssistant failed:", error);
    return {
      error: "No pude procesar la consulta. Probá de nuevo en un momento.",
    };
  }
}
