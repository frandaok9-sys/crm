/**
 * Plantillas de la Pizarra (M6, fase 2): arrancar de una estructura en vez
 * de un lienzo en blanco — la función más pedida en Miro/Lucid/FigJam para
 * "bajada de ideas". Cada plantilla es un "esqueleto" (formato compacto de
 * Excalidraw) que el editor expande en el navegador con
 * convertToExcalidrawElements. Cada plantilla arma un FRAME (con sus
 * elementos como children), así también sirve como diapositiva en el modo
 * presentación.
 */

export type BoardTemplateId =
  | "blank"
  | "lluvia"
  | "obra"
  | "organigrama"
  | "pipeline";

export type BoardTemplate = {
  id: BoardTemplateId;
  label: string;
  hint: string;
  /** Ícono SVG (trazo) para la tarjeta de selección. */
  icon: string;
};

export const BOARD_TEMPLATES: BoardTemplate[] = [
  { id: "blank", label: "En blanco", hint: "Lienzo vacío", icon: "M4 4h16v16H4z" },
  { id: "lluvia", label: "Lluvia de ideas", hint: "Notas para tirar ideas", icon: "M9 18h6M10 22h4M12 2a7 7 0 00-4 12.7c.6.5 1 1.2 1 2h6c0-.8.4-1.5 1-2A7 7 0 0012 2z" },
  { id: "obra", label: "Plan de obra", hint: "Por hacer · En curso · Terminado", icon: "M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" },
  { id: "organigrama", label: "Organigrama", hint: "Cajas conectadas", icon: "M9 4h6v4H9zM3 16h6v4H3zM15 16h6v4h-6zM12 8v4M6 16v-2h12v2" },
  { id: "pipeline", label: "Reunión de pipeline", hint: "Columnas por etapa", icon: "M4 6h4v14H4zM10 6h4v14h-4zM16 6h4v14h-4z" },
];

const AMBER = "#fff3bf", BLUE = "#d0ebff", GREEN = "#d3f9d8", PINK = "#ffdeeb", GRAY = "#f1f3f5";
const CARD = { strokeColor: "#1e1e1e", strokeWidth: 1, roughness: 0 as const };

type Skeleton = Record<string, unknown>;

function note(id: string, x: number, y: number, text: string, bg: string): Skeleton {
  return {
    type: "rectangle", id, x, y, width: 180, height: 96,
    backgroundColor: bg, fillStyle: "solid", ...CARD,
    label: { text, fontSize: 16 },
  };
}
function heading(id: string, x: number, y: number, text: string, size = 28): Skeleton {
  return { type: "text", id, x, y, text, fontSize: size };
}
function box(id: string, x: number, y: number, text: string, bg = GRAY): Skeleton {
  return { type: "rectangle", id, x, y, width: 200, height: 70, backgroundColor: bg, fillStyle: "solid", ...CARD, label: { text, fontSize: 16 } };
}
function arrow(id: string, from: string, to: string): Skeleton {
  return { type: "arrow", id, x: 0, y: 0, strokeColor: "#495057", roughness: 0, start: { id: from }, end: { id: to } };
}
/** Frame (cuadro/diapositiva) que agrupa a los elementos por id. */
function frame(name: string, children: string[]): Skeleton {
  return { type: "frame", name, children };
}

/**
 * Esqueleto de una plantilla. El editor lo expande con
 * convertToExcalidrawElements (los frames toman su tamaño de sus children).
 */
export function templateSkeleton(id: BoardTemplateId): Skeleton[] {
  switch (id) {
    case "lluvia": {
      const ids = ["h", "l1", "l2", "l3", "l4", "l5", "l6"];
      return [
        heading("h", 80, 60, "🧠 Lluvia de ideas"),
        note("l1", 80, 130, "Idea 1", AMBER),
        note("l2", 300, 130, "Idea 2", BLUE),
        note("l3", 520, 130, "Idea 3", GREEN),
        note("l4", 80, 260, "Idea 4", PINK),
        note("l5", 300, 260, "¿Qué falta?", GRAY),
        note("l6", 520, 260, "Próximo paso", AMBER),
        frame("Ideas", ids),
      ];
    }
    case "obra": {
      const ids = ["h", "c1", "c2", "c3", "o1", "o2", "o3", "o4"];
      return [
        heading("h", 80, 60, "🏗️ Plan de obra"),
        heading("c1", 100, 120, "Por hacer", 20),
        heading("c2", 400, 120, "En curso", 20),
        heading("c3", 700, 120, "Terminado", 20),
        note("o1", 80, 160, "Preparar superficie", AMBER),
        note("o2", 80, 280, "Comprar materiales", AMBER),
        note("o3", 380, 160, "Pulido grueso", BLUE),
        note("o4", 680, 160, "Relevamiento", GREEN),
        frame("Plan de obra", ids),
      ];
    }
    case "organigrama": {
      const ids = ["g0", "g1", "g2", "g3", "g4", "a1", "a2", "a3", "a4"];
      return [
        box("g0", 280, 80, "Gerencia", "#e7f5ff"),
        box("g1", 90, 240, "Ventas", GRAY),
        box("g2", 300, 240, "Obra", GRAY),
        box("g3", 510, 240, "Administración", GRAY),
        box("g4", 300, 380, "Contador", "#fff9db"),
        arrow("a1", "g0", "g1"),
        arrow("a2", "g0", "g2"),
        arrow("a3", "g0", "g3"),
        arrow("a4", "g3", "g4"),
        frame("Organigrama", ids),
      ];
    }
    case "pipeline": {
      const ids = ["h", "c1", "c2", "c3", "c4", "p1", "p2", "p3", "p4"];
      return [
        heading("h", 80, 60, "📌 Reunión de pipeline"),
        heading("c1", 100, 120, "Leads", 20),
        heading("c2", 350, 120, "Propuesta", 20),
        heading("c3", 600, 120, "Negociación", 20),
        heading("c4", 850, 120, "En ejecución", 20),
        note("p1", 80, 160, "Cliente A", GRAY),
        note("p2", 330, 160, "Cliente B", BLUE),
        note("p3", 580, 160, "Cliente C", AMBER),
        note("p4", 830, 160, "Obra D", GREEN),
        frame("Pipeline", ids),
      ];
    }
    case "blank":
    default:
      return [];
  }
}
