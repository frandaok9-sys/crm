"use client";

import { useState } from "react";

const MAX_PHOTOS = 10;
// Lado mayor al que se reduce cada foto antes de subir (calidad JPEG 0.82):
// una foto de celu de 4-8 MB queda en ~150-350 KB sin perder utilidad.
const MAX_DIMENSION = 1600;

export type ExistingPhoto = { id: string; data: string; caption: string | null };
type NewPhoto = { dataUrl: string; caption: string };

async function compressToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.82);
}

/**
 * Fotos de la propuesta (parte técnica del presupuesto). Las nuevas se
 * comprimen en el navegador y viajan como data URLs en un hidden JSON junto
 * con el resto del formulario; las existentes se pueden quitar (se marcan y
 * el servidor las borra al guardar).
 */
export function QuotePhotosField({
  existing = [],
}: {
  existing?: ExistingPhoto[];
}) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<NewPhoto[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const kept = existing.filter((p) => !removed.includes(p.id));
  const total = kept.length + added.length;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (files.length === 0) return;
    setError(null);
    if (total + files.length > MAX_PHOTOS) {
      setError(`Máximo ${MAX_PHOTOS} fotos por presupuesto.`);
      return;
    }
    setBusy(true);
    try {
      const compressed: NewPhoto[] = [];
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        compressed.push({ dataUrl: await compressToDataUrl(file), caption: "" });
      }
      setAdded((prev) => [...prev, ...compressed]);
    } catch {
      setError("No se pudo procesar una de las imágenes. Probá con JPG o PNG.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="newPhotos" value={JSON.stringify(added)} />
      <input type="hidden" name="removePhotoIds" value={JSON.stringify(removed)} />

      {(kept.length > 0 || added.length > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {kept.map((p) => (
            <figure key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.data}
                alt={p.caption ?? "Foto de la propuesta"}
                className="h-28 w-full rounded-lg border object-cover dark:border-zinc-700"
              />
              <button
                type="button"
                title="Quitar foto"
                onClick={() => setRemoved((prev) => [...prev, p.id])}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white hover:bg-red-600"
              >
                ✕
              </button>
              {p.caption && (
                <figcaption className="mt-0.5 truncate text-[11px] text-zinc-500">
                  {p.caption}
                </figcaption>
              )}
            </figure>
          ))}
          {added.map((p, i) => (
            <figure key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.dataUrl}
                alt="Foto nueva"
                className="h-28 w-full rounded-lg border object-cover dark:border-zinc-700"
              />
              <button
                type="button"
                title="Quitar foto"
                onClick={() =>
                  setAdded((prev) => prev.filter((_, j) => j !== i))
                }
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white hover:bg-red-600"
              >
                ✕
              </button>
              <input
                value={p.caption}
                maxLength={200}
                placeholder="Epígrafe (opcional)"
                onChange={(e) =>
                  setAdded((prev) =>
                    prev.map((q, j) =>
                      j === i ? { ...q, caption: e.target.value } : q
                    )
                  )
                }
                className="mt-1 w-full rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
              />
            </figure>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <label className="cursor-pointer rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
          {busy ? "Procesando…" : "+ Agregar fotos"}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onPick}
            disabled={busy || total >= MAX_PHOTOS}
            className="hidden"
          />
        </label>
        <span className="text-[11px] text-zinc-400">
          {total}/{MAX_PHOTOS} · se comprimen solas al subir
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
