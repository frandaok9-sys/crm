import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";

import type { Principal } from "@/lib/permissions";
import { toolsForUser, describeScope, runTool } from "@/lib/assistant-tools";

/**
 * "Cerebro" del asistente de IA del CRM (Fase 6), sobre la API de Anthropic
 * (Claude). Hoy se usa desde el chat de demostración en la web (/asistente);
 * más adelante el mismo motor atenderá el canal de WhatsApp — por eso vive en
 * lib/, sin nada específico de UI, y consulta el CRM SOLO a través de
 * lib/assistant-tools.ts (permisos ya aplicados ahí, nunca duplicados acá).
 */

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ToolCallLog = { name: string; args: Record<string, unknown> };

export type AssistantResult = {
  reply: string;
  toolCalls: ToolCallLog[];
};

// Haiku: el modelo más económico de la familia Claude, sobrado para consultas
// de CRM con herramientas. Cambiable por env sin tocar código.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const MAX_TOOL_ROUNDS = 5;
const MAX_TOKENS = 900;

function systemPrompt(
  user: Principal & { name?: string | null; email?: string | null }
): string {
  const nombre = user.name ?? user.email ?? "el usuario";
  return `Asistente interno del CRM de RC Pisos Industriales (pisos industriales B2B, Mendoza). Hablás con ${nombre}.

ALCANCE DE ESTE USUARIO: ${describeScope(user)} Enmarcá las respuestas según esto (decí "tu cartera" o "la empresa" según corresponda) y nunca ofrezcas ni prometas datos fuera de su alcance.

ESTÁNDAR DE RESPUESTA:
- Español rioplatense, conciso y objetivo. Solo los datos que responden la pregunta. Sin introducciones ("Acá está…"), sin cierres ("¿Necesitás algo más?"), sin opiniones ni relleno.
- Elegí UN formato según el dato: tabla Markdown para listas de varias filas; gráfico para comparar 2+ valores numéricos; una o dos líneas para un dato puntual. No repitas los mismos datos en tabla y gráfico.
- Gráfico = bloque \`\`\`chart\` con JSON: {"title","unit","series":[{"label","value"}]}. unit ∈ "ARS"|"USD"|"m²"|"%"|"". value = número crudo. Un gráfico = una sola moneda (ARS y USD van en gráficos separados).
- Reproducí los montos tal como los devuelven las herramientas (ya formateados); no recalcules.

REGLAS (no negociables):
- Informá solo lo que devuelven las herramientas; nunca inventes datos.
- Solo lectura: no creás/editás/borrás nada. Si lo piden, decilo en una línea (hay que hacerlo desde el CRM).
- Nunca sumes ni compares ARS con USD.
- Si una herramienta devuelve "error" o falta de permiso, comunicá eso tal cual.
- Si falta el dato, decilo; no adivines.`;
}

/** Herramientas visibles para este usuario (CAPA 1 de permisos). */
function toolsFor(user: Principal): Tool[] {
  return toolsForUser(user).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Tool.InputSchema,
  }));
}

/**
 * La API exige que los mensajes empiecen con "user" y alternen roles. El
 * historial del chat arranca con el saludo del asistente y puede traer dos
 * turnos seguidos del mismo rol (p. ej. tras un error): acá se normaliza.
 */
function normalizeHistory(
  history: ChatMessage[],
  message: string
): MessageParam[] {
  const merged: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of [...history, { role: "user" as const, content: message }]) {
    const text = m.content.trim();
    if (!text) continue;
    const prev = merged[merged.length - 1];
    if (prev && prev.role === m.role) {
      prev.text += `\n\n${text}`;
    } else {
      merged.push({ role: m.role, text });
    }
  }
  while (merged.length > 0 && merged[0].role !== "user") merged.shift();
  return merged.map((m) => ({ role: m.role, content: m.text }));
}

/** Ejecuta una consulta contra el modelo, resolviendo las llamadas a herramientas que pida. */
export async function runAssistant(
  user: Principal & { name?: string | null; email?: string | null },
  history: ChatMessage[],
  message: string
): Promise<AssistantResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar ANTHROPIC_API_KEY en el servidor.");
  }
  const client = new Anthropic({ apiKey });

  const tools = toolsFor(user);
  const messages: MessageParam[] = normalizeHistory(history, message);
  const toolCalls: ToolCallLog[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      system: systemPrompt(user),
      tools,
      messages,
    });

    const toolUses = response.content.filter(
      (block): block is ToolUseBlock => block.type === "tool_use"
    );

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .map((block) => (block.type === "text" ? block.text : ""))
        .join("")
        .trim();
      return {
        reply: text || "No obtuve una respuesta. Probá reformular la consulta.",
        toolCalls,
      };
    }

    // El turno del modelo se reenvía tal cual (conserva sus bloques internos).
    messages.push({ role: "assistant", content: response.content });

    const results: ToolResultBlockParam[] = await Promise.all(
      toolUses.map(async (block) => {
        const args = (block.input ?? {}) as Record<string, unknown>;
        toolCalls.push({ name: block.name, args });
        const result = await runTool(block.name, args, user);
        return {
          type: "tool_result" as const,
          tool_use_id: block.id,
          content: JSON.stringify(result),
        };
      })
    );
    messages.push({ role: "user", content: results });
  }

  return {
    reply: "La consulta requirió demasiados pasos. Probá con una pregunta más puntual.",
    toolCalls,
  };
}
