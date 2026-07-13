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

// Búsqueda web de Anthropic (herramienta de servidor: se resuelve sola). Con
// tope de usos por consulta para acotar el costo (la web SÍ cuesta, a
// diferencia de las herramientas internas del CRM).
const WEB_SEARCH_TOOL = { type: "web_search_20250305", name: "web_search", max_uses: 3 };

function systemPrompt(
  user: Principal & { name?: string | null; email?: string | null },
  today: { pretty: string; iso: string }
): string {
  const nombre = user.name ?? user.email ?? "el usuario";
  return `Asistente interno del CRM de RC Pisos Industriales. Hablás con ${nombre}.

CONTEXTO DEL NEGOCIO: RC instala pisos industriales (hormigón pulido, epoxi, poliuretano) en Mendoza, Argentina. Vende por OBRA/PROYECTO, cotizando por m². Clientes B2B por segmento: bodegas/vitivinícolas, agroindustria, constructoras, plantas/fábricas, logística, comercio. Cada oportunidad tiene m² estimados de la obra (dato clave para dimensionar el trabajo). Pipeline: Prospecto → Contactado → Propuesta enviada → Negociación → Ganada/Perdida. Presupuestos por m² con IVA discriminado, en ARS o USD; la cuenta corriente y los saldos van SIEMPRE separados por moneda. Catálogo de insumos: marcas Sinteplast y Ashford.

HOY ES ${today.pretty} (${today.iso}, hora de Argentina). Usalo para interpretar fechas relativas ("hoy", "esta semana", "este mes", "últimos 30 días", "este año", "el mes pasado"). Cuando filtres por fecha, calculá el rango vos y pasá "desde"/"hasta" en formato AAAA-MM-DD a las herramientas que lo aceptan.

ALCANCE DE ESTE USUARIO: ${describeScope(user)} Enmarcá las respuestas según esto (decí "tu cartera" o "la empresa" según corresponda) y nunca ofrezcas ni prometas datos fuera de su alcance.

ESTÁNDAR DE RESPUESTA:
- Español rioplatense, conciso y objetivo. Solo los datos que responden la pregunta. Sin introducciones ("Acá está…"), sin cierres ("¿Necesitás algo más?"), sin opiniones ni relleno.
- Elegí UN formato según el dato: tabla Markdown para listas de varias filas; gráfico para comparar 2+ valores numéricos; una o dos líneas para un dato puntual. No repitas los mismos datos en tabla y gráfico.
- Gráfico = bloque \`\`\`chart\` con JSON: {"title","unit","series":[{"label","value"}]}. unit ∈ "ARS"|"USD"|"m²"|"%"|"". value = número crudo. Un gráfico = una sola moneda (ARS y USD van en gráficos separados).
- Reproducí los montos tal como los devuelven las herramientas (ya formateados); no recalcules.

HOJAS DE RUTA (planificación de visitas):
- Podés ARMAR una hoja de ruta con "armar_hoja_ruta" (salida + destinos: direcciones, ciudades o nombres de clientes de la cartera). Al responder, mostrá el recorrido en orden con el km de cada tramo, el total (km y tiempo), el costo estimado de combustible y el link de Google Maps. Aclará que el combustible es una estimación.
- Podés traer las guardadas con "hojas_de_ruta" (para "mis rutas" o "el link de maps de tal ruta").
- Cuando pidan UNA hoja de ruta con detalle o "el mapa/captura", usá "detalle_hoja_ruta". En la respuesta: (1) insertá la imagen del mapa con la sintaxis Markdown de imagen usando el campo "mapa_imagen" tal cual: ![Mapa de la ruta](VALOR_DE_mapa_imagen); (2) poné el link "Abrir en Google Maps" con el campo "maps"; (3) una tabla del recorrido con destino, etapa, m², monto, dirección y contacto. No inventes datos que no vengan.

BÚSQUEDA WEB:
- Tenés búsqueda web disponible, pero TIENE COSTO: usala SOLO cuando la pregunta necesita información que NO está en el CRM ni en tus herramientas internas (p. ej. precios de mercado o de insumos, datos públicos de una empresa/proveedor, normativa, clima o estado de rutas).
- Para TODO lo del CRM (clientes, oportunidades, presupuestos, métricas, cobranzas, hojas de ruta) usá SIEMPRE las herramientas internas, nunca la web.
- Si la pregunta se responde sin buscar, no busques. Cuando uses la web, citá brevemente la fuente y no copies textos largos.

REGLAS (no negociables):
- Informá solo lo que devuelven las herramientas; nunca inventes datos.
- Solo lectura, con UNA excepción: podés armar y guardar HOJAS DE RUTA (planificación de visitas) con las herramientas dedicadas. Nada más se crea/edita/borra: cualquier otro cambio (clientes, oportunidades, presupuestos, cobranzas) se hace desde el CRM.
- Nunca sumes ni compares ARS con USD.
- Si una herramienta devuelve "error" o falta de permiso, comunicá eso tal cual.
- Si falta el dato, decilo; no adivines.`;
}

const AR_TZ = "America/Argentina/Buenos_Aires"; // UTC-3, sin horario de verano

/** Fecha de hoy en hora de Argentina: legible ("miércoles, 9 de julio de 2026") + ISO ("2026-07-09"). */
function todayInArgentina(): { pretty: string; iso: string } {
  const now = new Date();
  const pretty = new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: AR_TZ,
  }).format(now);
  // en-CA da el formato AAAA-MM-DD.
  const iso = new Intl.DateTimeFormat("en-CA", { timeZone: AR_TZ }).format(now);
  return { pretty, iso };
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

  // Herramientas internas del CRM (gratis) + búsqueda web (con costo, acotada).
  const tools = [...toolsFor(user), WEB_SEARCH_TOOL] as unknown as Tool[];
  const today = todayInArgentina();
  const system = systemPrompt(user, today);
  const messages: MessageParam[] = normalizeHistory(history, message);
  const toolCalls: ToolCallLog[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0.2,
      system,
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
