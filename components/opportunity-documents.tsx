"use client";

import { useRef, useState } from "react";

import {
  uploadOpportunityDocument,
  deleteOpportunityDocument,
} from "@/app/(app)/oportunidades/actions";
import { SubmitButton } from "@/components/submit-button";

const MAX_BYTES = 4 * 1024 * 1024;

export type OpportunityDoc = {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  size: number;
  createdAt: Date;
  uploadedBy: { name: string | null; email: string } | null;
};

function icono(mime: string): string {
  if (mime === "application/pdf") return "📄";
  if (mime.startsWith("image/")) return "🖼️";
  if (mime.includes("word")) return "📝";
  if (mime.includes("sheet") || mime.includes("excel")) return "📊";
  return "📎";
}

function peso(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Documentos de la obra: pliego del cliente, planos, orden de compra, actas,
 * fotos del relevamiento. Se suben de a uno y quedan disponibles para todo
 * el equipo que ve la obra.
 */
export function OpportunityDocuments({
  opportunityId,
  documents,
  canEdit,
}: {
  opportunityId: string;
  documents: OpportunityDoc[];
  canEdit: boolean;
}) {
  const [fileLabel, setFileLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setFileLabel(null);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(
        `"${file.name}" pesa ${peso(file.size)}: el máximo es 4 MB. Comprimí el PDF o sacá la foto en menor calidad.`
      );
      e.target.value = "";
      setFileLabel(null);
      return;
    }
    setError(null);
    setFileLabel(`${file.name} · ${peso(file.size)}`);
  }

  return (
    <section className="rounded-xl border bg-white p-6 dark:bg-zinc-900">
      <h2 className="mb-1 text-sm font-medium text-zinc-500">Documentos</h2>
      <p className="mb-4 text-xs text-zinc-400">
        Pliego del cliente, planos, orden de compra, actas, fotos del
        relevamiento… Los ve todo el equipo que tiene acceso a esta obra.
      </p>

      {documents.length > 0 && (
        <ul className="mb-4 divide-y dark:divide-zinc-800">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 py-2.5 text-sm">
              <span aria-hidden className="text-lg">
                {icono(d.mimeType)}
              </span>
              <div className="min-w-0 flex-1">
                <a
                  href={`/oportunidades/${opportunityId}/documentos/${d.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate font-medium text-primary hover:underline"
                >
                  {d.name}
                </a>
                <p className="truncate text-xs text-zinc-400">
                  {d.fileName} · {peso(d.size)}
                  {d.uploadedBy && (
                    <> · {d.uploadedBy.name ?? d.uploadedBy.email}</>
                  )}
                </p>
              </div>
              {canEdit && (
                <form
                  action={deleteOpportunityDocument}
                  onSubmit={(e) => {
                    if (!confirm(`¿Borrar "${d.name}"? No se puede deshacer.`)) {
                      e.preventDefault();
                    }
                  }}
                >
                  <input type="hidden" name="id" value={d.id} />
                  <button
                    type="submit"
                    title="Borrar documento"
                    className="text-zinc-400 hover:text-red-600"
                  >
                    ✕
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}

      {documents.length === 0 && (
        <p className="mb-4 text-sm text-zinc-400">
          Todavía no hay documentos adjuntos.
        </p>
      )}

      {canEdit && (
        <form action={uploadOpportunityDocument} className="space-y-2">
          <input type="hidden" name="opportunityId" value={opportunityId} />
          <div className="flex flex-wrap items-center gap-2">
            <label className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
              Elegir archivo
              <input
                ref={fileRef}
                type="file"
                name="file"
                required
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx"
                onChange={onPick}
                className="hidden"
              />
            </label>
            <input
              name="name"
              maxLength={120}
              placeholder="Nombre (opcional, ej: Pliego Andina 2025)"
              className="min-w-[200px] flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-800"
            />
            <SubmitButton size="sm" pendingText="Subiendo…">
              Adjuntar
            </SubmitButton>
          </div>
          {fileLabel && (
            <p className="text-xs text-zinc-500">Elegido: {fileLabel}</p>
          )}
          {error && <p className="text-xs text-red-600">{error}</p>}
          <p className="text-[11px] text-zinc-400">
            PDF, fotos, Word o Excel · hasta 4 MB por archivo.
          </p>
        </form>
      )}
    </section>
  );
}
