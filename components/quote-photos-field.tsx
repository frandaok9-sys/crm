"use client";

import { createContext, useContext, useRef, useState } from "react";

import { deleteCompanyImage } from "@/app/(app)/presupuestos/actions";

const MAX_PER_SECTION = 8;
const MAX_TOTAL_PHOTOS = 20;
// Presupuesto de PESO total de fotos nuevas por guardado: los data URLs
// viajan en el POST del formulario y Vercel corta los pedidos en ~4,5 MB.
// 3,5 M de caracteres base64 ≈ 2,6 MB de imagen: margen seguro.
const MAX_TOTAL_CHARS = 3_500_000;
// Lado mayor al que se reduce cada foto (JPEG 0.80): una foto de celu de
// 4-8 MB queda en ~150-300 KB sin perder utilidad en el PDF.
const MAX_DIMENSION = 1400;

export type ExistingPhoto = {
  id: string;
  data: string;
  caption: string | null;
  section: string | null;
};
export type LibraryImage = { id: string; name: string; data: string };
type NewPhoto = {
  dataUrl: string;
  caption: string;
  saveToLibrary: boolean;
  fromLibrary?: boolean;
};

// ---------------------------------------------------------------------------
// Presupuesto COMPARTIDO entre las 6 instancias del formulario: tope total
// de fotos y de peso, para que el guardado nunca supere el límite del POST.
// ---------------------------------------------------------------------------
type Budget = {
  tryReserve: (chars: number) => string | null; // null = ok, string = error
  release: (chars: number) => void;
};
const BudgetContext = createContext<Budget | null>(null);

export function QuotePhotoBudget({
  initialCount,
  children,
}: {
  /** Fotos ya guardadas en el presupuesto (cuentan para el tope total). */
  initialCount: number;
  children: React.ReactNode;
}) {
  const state = useRef({ count: initialCount, chars: 0 });
  const budget = useRef<Budget>({
    tryReserve(chars: number) {
      if (state.current.count + 1 > MAX_TOTAL_PHOTOS) {
        return `Máximo ${MAX_TOTAL_PHOTOS} fotos por presupuesto (entre todas las secciones).`;
      }
      if (state.current.chars + chars > MAX_TOTAL_CHARS) {
        return "Se alcanzó el peso máximo de fotos nuevas para un guardado. Guardá el presupuesto y agregá el resto editándolo.";
      }
      state.current.count += 1;
      state.current.chars += chars;
      return null;
    },
    release(chars: number) {
      state.current.count = Math.max(0, state.current.count - 1);
      state.current.chars = Math.max(0, state.current.chars - chars);
    },
  });
  return (
    <BudgetContext.Provider value={budget.current}>
      {children}
    </BudgetContext.Provider>
  );
}

async function compressToDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas");
  // Fondo blanco: un PNG con transparencia quedaría NEGRO al pasar a JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.8);
}

/**
 * Fotos de UNA sección del pliego (alcance, tareas, garantía…). Se pueden
 * subir nuevas (comprimidas en el navegador) o insertar desde la biblioteca
 * de la empresa (certificación Ashford, pulidoras, etc. — se copian, así
 * que borrar de la biblioteca no afecta presupuestos armados). Todo viaja
 * en hidden inputs con el nombre de la sección y se guarda con el resto
 * del formulario.
 */
export function QuotePhotosField({
  section,
  existing = [],
  library = [],
}: {
  section: string;
  existing?: ExistingPhoto[];
  library?: LibraryImage[];
}) {
  const [removed, setRemoved] = useState<string[]>([]);
  const [added, setAdded] = useState<NewPhoto[]>([]);
  const [libraryList, setLibraryList] = useState(library);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const budget = useContext(BudgetContext);

  const kept = existing.filter((p) => !removed.includes(p.id));
  const total = kept.length + added.length;

  function reserve(chars: number): string | null {
    if (total + 1 > MAX_PER_SECTION) {
      return `Máximo ${MAX_PER_SECTION} fotos en esta sección.`;
    }
    return budget ? budget.tryReserve(chars) : null;
  }

  function drop(index: number) {
    const photo = added[index];
    if (photo) budget?.release(photo.dataUrl.length);
    setAdded((prev) => prev.filter((_, j) => j !== index));
  }

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (files.length === 0) return;
    setError(null);
    setBusy(true);
    // Cada archivo se procesa por separado: uno malo (HEIC de iPhone, un
    // formato raro) NO descarta el resto del lote.
    let failed = 0;
    let refused: string | null = null;
    const ok: NewPhoto[] = [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        failed++;
        continue;
      }
      try {
        const dataUrl = await compressToDataUrl(file);
        const problem = reserve(dataUrl.length);
        if (problem) {
          refused = problem;
          break;
        }
        ok.push({ dataUrl, caption: "", saveToLibrary: false });
      } catch {
        failed++;
      }
    }
    if (ok.length > 0) setAdded((prev) => [...prev, ...ok]);
    const messages: string[] = [];
    if (failed > 0) {
      messages.push(
        `${failed} archivo(s) no se pudieron procesar: usá JPG o PNG (las fotos HEIC de iPhone hay que convertirlas o mandarlas por WhatsApp primero).`
      );
    }
    if (refused) messages.push(refused);
    setError(messages.length ? messages.join(" ") : null);
    setBusy(false);
  }

  function addFromLibrary(img: LibraryImage) {
    const problem = reserve(img.data.length);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setAdded((prev) => [
      ...prev,
      // fromLibrary: ya está en la biblioteca, no ofrecer re-guardarla.
      { dataUrl: img.data, caption: img.name, saveToLibrary: false, fromLibrary: true },
    ]);
    setPickerOpen(false);
  }

  async function removeFromLibrary(img: LibraryImage) {
    if (
      !confirm(
        `¿Borrar "${img.name}" de la biblioteca?\nLos presupuestos que ya la usan no se tocan.`
      )
    ) {
      return;
    }
    setLibraryList((prev) => prev.filter((i) => i.id !== img.id));
    try {
      await deleteCompanyImage(img.id);
    } catch {
      // Si falló (sin permisos, sin conexión), la imagen vuelve a la lista.
      setLibraryList((prev) => [...prev, img]);
      setError("No se pudo borrar de la biblioteca.");
    }
  }

  return (
    <div className="space-y-2">
      <input
        type="hidden"
        name={`newPhotos_${section}`}
        value={JSON.stringify(added)}
      />
      <input
        type="hidden"
        name={`removePhotoIds_${section}`}
        value={JSON.stringify(removed)}
      />

      {(kept.length > 0 || added.length > 0) && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kept.map((p) => (
            <figure key={p.id} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.data}
                alt={p.caption ?? "Foto"}
                className="h-24 w-full rounded-lg border object-cover dark:border-zinc-700"
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
                className="h-24 w-full rounded-lg border object-cover dark:border-zinc-700"
              />
              <button
                type="button"
                title="Quitar foto"
                onClick={() => drop(i)}
                className="absolute right-1 top-1 rounded-full bg-black/60 px-1.5 text-xs text-white hover:bg-red-600"
              >
                ✕
              </button>
              {/* defaultValue + onBlur: escribir el epígrafe no re-serializa
                  los MB del hidden en cada tecla, solo al salir del campo. */}
              <input
                defaultValue={p.caption}
                maxLength={200}
                placeholder="Epígrafe (opcional)"
                onBlur={(e) =>
                  setAdded((prev) =>
                    prev.map((q, j) =>
                      j === i ? { ...q, caption: e.target.value } : q
                    )
                  )
                }
                className="mt-1 w-full rounded border border-zinc-300 px-1.5 py-0.5 text-[11px] dark:border-zinc-700 dark:bg-zinc-800"
              />
              {!p.fromLibrary && (
                <label className="mt-0.5 flex items-center gap-1 text-[11px] text-zinc-500">
                  <input
                    type="checkbox"
                    checked={p.saveToLibrary}
                    onChange={(e) =>
                      setAdded((prev) =>
                        prev.map((q, j) =>
                          j === i
                            ? { ...q, saveToLibrary: e.target.checked }
                            : q
                        )
                      )
                    }
                  />
                  Guardar en biblioteca
                </label>
              )}
            </figure>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="cursor-pointer rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
          {busy ? "Procesando…" : "+ Subir fotos"}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={onPick}
            disabled={busy || total >= MAX_PER_SECTION}
            className="hidden"
          />
        </label>
        {libraryList.length > 0 && (
          <button
            type="button"
            onClick={() => setPickerOpen((v) => !v)}
            className="rounded-lg border border-primary/40 bg-primary/5 px-2.5 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
          >
            {pickerOpen ? "Cerrar biblioteca" : "📚 De la biblioteca"}
          </button>
        )}
        {error && <span className="text-[11px] text-red-600">{error}</span>}
      </div>

      {pickerOpen && (
        <div className="rounded-lg border bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-800/60">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {libraryList.map((img) => (
              <figure key={img.id} className="relative">
                <button
                  type="button"
                  title={`Insertar "${img.name}"`}
                  onClick={() => addFromLibrary(img)}
                  className="block w-full"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.data}
                    alt={img.name}
                    className="h-16 w-full rounded border object-cover hover:ring-2 hover:ring-primary dark:border-zinc-600"
                  />
                </button>
                <button
                  type="button"
                  title="Borrar de la biblioteca (solo admins/gerentes)"
                  onClick={() => removeFromLibrary(img)}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/60 px-1 text-[10px] text-white hover:bg-red-600"
                >
                  ✕
                </button>
                <figcaption className="mt-0.5 truncate text-[10px] text-zinc-500">
                  {img.name}
                </figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-zinc-400">
            Clic en una imagen para insertarla en esta sección (se copia: la
            biblioteca queda intacta).
          </p>
        </div>
      )}
    </div>
  );
}
