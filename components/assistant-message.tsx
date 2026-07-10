"use client";

import { useMemo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renderiza la respuesta del asistente con una "plantilla gráfica" consistente:
 * - Markdown con formato (negritas, listas, títulos) integrado al tema.
 * - Tablas de verdad (no texto con "|").
 * - Bloques ```chart …``` convertidos en gráficos de barras temáticos.
 *
 * El modelo emite Markdown normal + bloques ```chart``` con un JSON:
 *   { "title": "...", "unit": "ARS"|"USD"|"m²"|"%"|"", "series": [{label,value}] }
 */

type ChartData = {
  title?: string;
  unit?: string;
  series: { label: string; value: number }[];
};

type Segment = { type: "md"; text: string } | { type: "chart"; data: ChartData };

const CHART_RE = /```chart\s*\n?([\s\S]*?)```/g;

function parseSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  CHART_RE.lastIndex = 0;
  while ((match = CHART_RE.exec(content)) !== null) {
    const before = content.slice(lastIndex, match.index);
    if (before.trim()) segments.push({ type: "md", text: before });
    try {
      const data = JSON.parse(match[1]) as ChartData;
      if (Array.isArray(data.series) && data.series.length > 0) {
        segments.push({ type: "chart", data });
      } else {
        segments.push({ type: "md", text: before ? "" : match[0] });
      }
    } catch {
      // JSON inválido: se ignora el bloque roto (no romper la respuesta).
    }
    lastIndex = match.index + match[0].length;
  }
  const rest = content.slice(lastIndex);
  if (rest.trim() || segments.length === 0) {
    segments.push({ type: "md", text: rest });
  }
  return segments;
}

function formatValue(value: number, unit?: string): string {
  const n = value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  switch ((unit ?? "").toLowerCase()) {
    case "ars":
    case "$":
      return `$ ${n}`;
    case "usd":
    case "us$":
      return `US$ ${n}`;
    case "m2":
    case "m²":
      return `${n} m²`;
    case "%":
      return `${n}%`;
    default:
      return n;
  }
}

function BarChart({ data }: { data: ChartData }) {
  const max = Math.max(...data.series.map((s) => Math.abs(s.value)), 1);
  return (
    <figure className="my-1 rounded-[10px] border border-border2 bg-card2 p-3.5">
      {data.title && (
        <figcaption className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-muted2">
          {data.title}
        </figcaption>
      )}
      <div className="space-y-2.5">
        {data.series.map((s, i) => (
          <div key={`${s.label}-${i}`}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-[12.5px]">
              <span className="min-w-0 truncate text-text2">{s.label}</span>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">
                {formatValue(s.value, data.unit)}
              </span>
            </div>
            <div className="h-2 rounded-[4px] bg-chip">
              <div
                className="h-2 rounded-[4px]"
                style={{
                  background: "var(--primary)",
                  width: `${Math.max((Math.abs(s.value) / max) * 100, 2)}%`,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </figure>
  );
}

const MD_COMPONENTS: Components = {
  p: ({ children }) => <p className="my-1.5 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => (
    <strong className="font-bold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      className="font-medium text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
  ul: ({ children }) => (
    <ul className="my-1.5 ml-1 list-disc space-y-1 pl-4 marker:text-muted2">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 ml-1 list-decimal space-y-1 pl-4 marker:text-muted2">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  h1: ({ children }) => (
    <h3 className="mb-1.5 mt-2 text-[15px] font-bold text-foreground first:mt-0">
      {children}
    </h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-1.5 mt-2 text-[14px] font-bold text-foreground first:mt-0">
      {children}
    </h3>
  ),
  h3: ({ children }) => (
    <h4 className="mb-1 mt-2 text-[13.5px] font-bold text-text1 first:mt-0">
      {children}
    </h4>
  ),
  code: ({ children }) => (
    <code className="rounded-[5px] bg-chip px-1.5 py-0.5 font-mono text-[12px] text-text1">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto rounded-[10px] border border-border2">
      <table className="w-full border-collapse text-[12.5px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-card2">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b border-border2 px-3 py-2 text-left text-[10.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border-b border-border2 px-3 py-2 align-top text-text2 tabular-nums last:[&]:border-0">
      {children}
    </td>
  ),
  tr: ({ children }) => (
    <tr className="transition-colors last:[&>td]:border-0 hover:bg-hoverbg">
      {children}
    </tr>
  ),
  hr: () => <hr className="my-3 border-border2" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/50 pl-3 text-text2">
      {children}
    </blockquote>
  ),
};

export function AssistantMessage({ content }: { content: string }) {
  const segments = useMemo(() => parseSegments(content), [content]);
  return (
    <div className="text-[13.5px] leading-relaxed text-text1">
      {segments.map((seg, i) =>
        seg.type === "chart" ? (
          <BarChart key={i} data={seg.data} />
        ) : (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
            {seg.text}
          </ReactMarkdown>
        )
      )}
    </div>
  );
}
