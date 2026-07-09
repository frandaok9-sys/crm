import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  type Content,
  type Part,
} from "@google/genai";

import type { Principal } from "@/lib/permissions";
import { ASSISTANT_TOOLS, runTool } from "@/lib/assistant-tools";

/**
 * "Cerebro" del asistente de IA del CRM (Fase 6). Hoy se usa desde el chat de
 * demostración en la web (/asistente); más adelante el mismo motor atenderá
 * el canal de WhatsApp — por eso vive en lib/, sin nada específico de UI, y
 * consulta el CRM SOLO a través de lib/assistant-tools.ts (permisos ya
 * aplicados ahí, nunca duplicados acá).
 */

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ToolCallLog = { name: string; args: Record<string, unknown> };

export type AssistantResult = {
  reply: string;
  toolCalls: ToolCallLog[];
};

const MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const MAX_TOOL_ROUNDS = 5;

function systemInstruction(user: {
  name?: string | null;
  email?: string | null;
}): string {
  const nombre = user.name ?? user.email ?? "el usuario";
  return `Sos el asistente interno del CRM de RC Pisos Industriales (empresa de pisos industriales para bodegas, agroindustria, constructoras, plantas y logística en Mendoza, Argentina).

Hablás con ${nombre}. Respondé siempre en español rioplatense, de forma breve, concreta y profesional, como lo haría un compañero de la oficina comercial. Usá viñetas o tablas simples cuando ayuden a leer una lista.

REGLAS ESTRICTAS (no negociables):
- Solo podés informar lo que te devuelvan las herramientas disponibles. Nunca inventes clientes, montos, oportunidades ni cifras.
- Sos de SOLO LECTURA: no podés crear, editar ni borrar nada. Si te piden una acción de escritura (cargar un cliente, cambiar un presupuesto, registrar un pago, etc.), explicá amablemente que todavía no podés hacer eso y que hay que hacerlo desde el CRM.
- Nunca sumes ni compares montos en ARS con montos en USD: son saldos y totales separados por moneda, siempre.
- Si una herramienta devuelve "error" o dice que no hay permiso, contáselo al usuario tal cual, sin rodeos ni inventar una alternativa.
- Si no encontrás información para responder algo, decilo honestamente en vez de adivinar.
- Los montos que te devuelven las herramientas ya vienen formateados (símbolo de moneda incluido): reproducilos tal cual, no los recalcules.`;
}

function toGeminiHistory(history: ChatMessage[]): Content[] {
  return history.map((m) => ({
    role: m.role === "user" ? "user" : "model",
    parts: [{ text: m.content }],
  }));
}

/** Ejecuta una consulta contra el modelo, resolviendo las llamadas a herramientas que pida. */
export async function runAssistant(
  user: Principal & { name?: string | null; email?: string | null },
  history: ChatMessage[],
  message: string
): Promise<AssistantResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Falta configurar GEMINI_API_KEY en el servidor.");
  }
  const ai = new GoogleGenAI({ apiKey });

  const contents: Content[] = [
    ...toGeminiHistory(history),
    { role: "user", parts: [{ text: message }] },
  ];
  const toolCalls: ToolCallLog[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents,
      config: {
        systemInstruction: systemInstruction(user),
        tools: [{ functionDeclarations: [...ASSISTANT_TOOLS] }],
        toolConfig: {
          functionCallingConfig: { mode: FunctionCallingConfigMode.AUTO },
        },
        temperature: 0.2,
      },
    });

    const calls = response.functionCalls;
    if (!calls || calls.length === 0) {
      const text = response.text?.trim();
      return {
        reply: text || "No obtuve una respuesta. Probá reformular la consulta.",
        toolCalls,
      };
    }

    const modelParts: Part[] = calls.map((call) => ({ functionCall: call }));
    contents.push({ role: "model", parts: modelParts });

    const responseParts: Part[] = await Promise.all(
      calls.map(async (call) => {
        const name = call.name ?? "";
        const args = (call.args ?? {}) as Record<string, unknown>;
        toolCalls.push({ name, args });
        const result = await runTool(name, args, user);
        return {
          functionResponse: { name, response: { output: result } },
        };
      })
    );
    contents.push({ role: "user", parts: responseParts });
  }

  return {
    reply: "La consulta requirió demasiados pasos. Probá con una pregunta más puntual.",
    toolCalls,
  };
}
