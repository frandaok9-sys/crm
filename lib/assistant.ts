import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  Tool,
  ToolResultBlockParam,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages";

import type { Principal } from "@/lib/permissions";
import { ASSISTANT_TOOLS, runTool } from "@/lib/assistant-tools";

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
const MAX_TOKENS = 1200;

function systemPrompt(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const nombre = user.name ?? user.email ?? "el usuario";
  return `Sos el asistente interno del CRM de RC Pisos Industriales (empresa de pisos industriales para bodegas, agroindustria, constructoras, plantas y logística en Mendoza, Argentina).

Hablás con ${nombre}. Respondé siempre en español rioplatense, de forma breve, concreta y profesional, como lo haría un compañero de la oficina comercial.

FORMATO DE RESPUESTA (tu salida se renderiza como Markdown con una plantilla gráfica):
- Usá **negritas** para destacar datos clave y viñetas para enumerar.
- Cuando presentes varias filas de datos comparables (varias oportunidades, clientes, presupuestos, etc.), usá SIEMPRE una tabla Markdown con encabezados (| Columna | … |). No pegues los datos como texto corrido.
- Cuando compares valores numéricos entre categorías (ranking de vendedores, montos por etapa/segmento, distribución, etc.), agregá un gráfico de barras con un bloque de código con lenguaje "chart" y adentro un JSON así:
\`\`\`chart
{"title": "Aprobado por vendedor (ARS)", "unit": "ARS", "series": [{"label": "María González", "value": 8000000}, {"label": "Juan Pérez", "value": 5200000}]}
\`\`\`
  Reglas del gráfico: "unit" es "ARS", "USD", "m²", "%" o "" (vacío). Un gráfico NUNCA mezcla monedas distintas: si hay ARS y USD, hacé dos gráficos separados. Los "value" son números crudos (sin símbolos ni separadores de miles). Usá gráfico solo cuando aporte (2 o más valores a comparar); para un dato suelto, texto normal.
- Podés combinar: una frase breve + una tabla o un gráfico. No repitas los mismos números en tabla y gráfico a la vez; elegí el formato que mejor comunique.

REGLAS ESTRICTAS (no negociables):
- Solo podés informar lo que te devuelvan las herramientas disponibles. Nunca inventes clientes, montos, oportunidades ni cifras.
- Sos de SOLO LECTURA: no podés crear, editar ni borrar nada. Si te piden una acción de escritura (cargar un cliente, cambiar un presupuesto, registrar un pago, etc.), explicá amablemente que todavía no podés hacer eso y que hay que hacerlo desde el CRM.
- Nunca sumes ni compares montos en ARS con montos en USD: son saldos y totales separados por moneda, siempre.
- Si una herramienta devuelve "error" o dice que no hay permiso, contáselo al usuario tal cual, sin rodeos ni inventar una alternativa.
- Si no encontrás información para responder algo, decilo honestamente en vez de adivinar.
- Los montos que te devuelven las herramientas ya vienen formateados (símbolo de moneda incluido): reproducilos tal cual, no los recalcules.`;
}

const TOOLS: Tool[] = ASSISTANT_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: t.inputSchema as Tool.InputSchema,
}));

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

  const messages: MessageParam[] = normalizeHistory(history, message);
  const toolCalls: ToolCallLog[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      system: systemPrompt(user),
      tools: TOOLS,
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
