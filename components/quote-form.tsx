import { SubmitButton } from "@/components/submit-button";
import { ClientCombobox } from "@/components/client-combobox";
import { FormSteps } from "@/components/form-steps";
import { PliegoDefaultsButton } from "@/components/pliego-defaults-button";
import {
  QuotePhotosField,
  QuotePhotoBudget,
  type ExistingPhoto,
  type LibraryImage,
} from "@/components/quote-photos-field";
import {
  QuoteItemsEditor,
  type QuoteRow,
  type CatalogProduct,
} from "@/components/quote-items-editor";
import { Currency } from "@/lib/generated/prisma/enums";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

const hintClass = "mt-1 block text-[11px] text-zinc-400";

type Owner = { id: string; name: string | null; email: string };

export const PAYMENT_TERMS = [
  "Contado",
  "15 días",
  "30 días",
  "45 días",
  "60 días",
] as const;

/**
 * Textos estándar de RC para el pliego técnico (basados en cotizaciones
 * reales tipo licitación). NO se precargan solos: se aplican únicamente
 * con el botón "Usar textos estándar de RC", así un presupuesto simple
 * nunca sale con condiciones que nadie revisó.
 */
const PLIEGO_DEFAULTS = {
  scopeText:
    "Provisión de materiales, mano de obra, equipos, herramientas y elementos necesarios para la puesta en valor de pisos de hormigón mediante procesos de pulido y densificado, con mano de obra calificada y certificada por el fabricante.",
  exclusions:
    "• Ingeniería básica / proyecto / detalle.\n• Confección de planos conforme a obra.\n• Disposición final de residuos.\n• Provisión de agua y energía eléctrica a pie de obra.",
  warrantyText:
    "Garantía escrita del trabajo, sujeta a las recomendaciones del fabricante. Somos una empresa certificada por el fabricante.",
  generalConditions:
    "Forma de pago: adelanto del 50% para acopio de materiales, consumibles e insumos; el resto contra certificaciones de avance.\nLa oferta corresponde al total de los trabajos: una contratación parcial implica la re-cotización del alcance.\nTodo extra o imprevisto que surja durante la obra será consultado previamente para evaluar costos.",
} as const;

export type QuoteFormData = {
  id?: string;
  clientId?: string;
  clientLegalName?: string;
  currency?: Currency;
  validUntil?: string; // yyyy-mm-dd
  notes?: string | null;
  ownerId?: string | null;
  paymentTerms?: string | null;
  overallDiscount?: string;
  items?: QuoteRow[];
  // Pliego técnico (etapas 2 y 3)
  photos?: ExistingPhoto[];
  siteTitle?: string | null;
  siteAddress?: string | null;
  deliveryTerm?: string | null;
  scopeText?: string | null;
  taskDescription?: string | null;
  exclusions?: string | null;
  warrantyText?: string | null;
  generalConditions?: string | null;
};

export function QuoteForm({
  action,
  taxRates,
  defaultRate,
  canAssign,
  owners,
  submitLabel,
  quote,
  products,
  library = [],
}: {
  action: (formData: FormData) => Promise<void>;
  taxRates: { rate: string; name: string }[];
  defaultRate: string;
  canAssign: boolean;
  owners: Owner[];
  submitLabel: string;
  quote?: QuoteFormData;
  products?: CatalogProduct[];
  library?: LibraryImage[];
}) {
  const currency = quote?.currency ?? Currency.ARS;
  const symbol = currency === Currency.USD ? "US$" : "$";
  // Fotos existentes agrupadas por sección del pliego.
  const photosFor = (section: string): ExistingPhoto[] =>
    (quote?.photos ?? []).filter(
      (p) => (p.section ?? "general") === section
    );

  // ---------- Etapa 1: Cotización ----------
  const stepCotizacion = (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Cliente *
          </span>
          <ClientCombobox
            name="clientId"
            defaultId={quote?.clientId ?? ""}
            defaultLabel={quote?.clientLegalName ?? ""}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Moneda
          </span>
          <select name="currency" defaultValue={currency} className={inputClass}>
            <option value={Currency.ARS}>Pesos (ARS)</option>
            <option value={Currency.USD}>Dólares (USD)</option>
          </select>
        </label>

        {canAssign && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Vendedor asignado
            </span>
            <select
              name="ownerId"
              defaultValue={quote?.ownerId ?? ""}
              className={inputClass}
            >
              <option value="">Según el cliente / sin asignar</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name ?? o.email}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="rounded-xl border p-4 dark:border-zinc-800">
        <h3 className="mb-3 text-sm font-medium text-zinc-500">Ítems</h3>
        <QuoteItemsEditor
          taxRates={taxRates}
          defaultRate={defaultRate}
          currencySymbol={symbol}
          initial={quote?.items}
          initialOverallDiscount={quote?.overallDiscount}
          products={products}
        />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Notas / condiciones breves
        </span>
        <textarea
          name="notes"
          rows={3}
          defaultValue={quote?.notes ?? ""}
          className={inputClass}
        />
      </label>
    </div>
  );

  // ---------- Etapa 2: Obra y plazos ----------
  const stepObra = (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Obra (título del trabajo)
        </span>
        <input
          name="siteTitle"
          maxLength={200}
          defaultValue={quote?.siteTitle ?? ""}
          placeholder="Ej: Pulido de pisos de hormigón — Planta Coca Cola Mendoza"
          className={inputClass}
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Lugar de la obra
        </span>
        <input
          name="siteAddress"
          maxLength={300}
          defaultValue={quote?.siteAddress ?? ""}
          placeholder="Ej: Carril Cervantes 960, Godoy Cruz, Mendoza"
          className={inputClass}
        />
      </label>

      <label className="block sm:col-span-2">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Plazo de entrega
        </span>
        <textarea
          name="deliveryTerm"
          rows={3}
          maxLength={2000}
          defaultValue={quote?.deliveryTerm ?? ""}
          placeholder="Ej: 30 días de trabajo desde el ingreso a planta, previa orden de compra y adelanto financiero. La fecha de inicio se coordina entre las partes."
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Mantenimiento de la oferta (válido hasta)
        </span>
        <input
          type="date"
          name="validUntil"
          defaultValue={quote?.validUntil ?? ""}
          className={inputClass}
        />
        <span className={hintClass}>
          Hasta cuándo se sostienen estos precios.
        </span>
      </label>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Condición de pago
        </span>
        <select
          name="paymentTerms"
          defaultValue={quote?.paymentTerms ?? ""}
          className={inputClass}
        >
          <option value="">Sin especificar</option>
          {PAYMENT_TERMS.map((term) => (
            <option key={term} value={term}>
              {term}
            </option>
          ))}
        </select>
        <span className={hintClass}>
          El detalle fino (adelantos, certificaciones) va en Condiciones
          generales, en la parte técnica.
        </span>
      </label>
    </div>
  );

  // ---------- Etapa 3: Parte técnica ----------
  // QuotePhotoBudget: tope COMPARTIDO de cantidad y peso de fotos entre las
  // 6 secciones (el guardado viaja en un solo POST con límite de tamaño).
  const stepTecnica = (
    <QuotePhotoBudget initialCount={quote?.photos?.length ?? 0}>
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-400">
          Estas secciones arman el informe técnico del PDF (estilo
          licitación). Las que queden vacías no se imprimen — un presupuesto
          simple puede salir solo con la planilla de precios.
        </p>
        <PliegoDefaultsButton defaults={PLIEGO_DEFAULTS} />
      </div>

      <div className="rounded-xl border p-4 dark:border-zinc-800">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Alcance del suministro o servicio
          </span>
          <textarea
            name="scopeText"
            rows={3}
            maxLength={5000}
            defaultValue={quote?.scopeText ?? ""}
            className={inputClass}
          />
        </label>
        <div className="mt-2">
          <QuotePhotosField
            section="scope"
            existing={photosFor("scope")}
            library={library}
          />
        </div>
      </div>

      <div className="rounded-xl border p-4 dark:border-zinc-800">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Descripción de tareas / solución técnica
          </span>
          <textarea
            name="taskDescription"
            rows={8}
            maxLength={10000}
            defaultValue={quote?.taskDescription ?? ""}
            placeholder={
              "Proceso propuesto, paso a paso. Ej:\n• Inspección y lavado de pisos con máquinas industriales.\n• Pulido con diamante de granulometría gruesa a fina.\n• Aplicación de densificador (Ashford Fórmula) y resinas de terminación.\n• Reparación de juntas al mismo nivel del piso.\nBeneficios: repelencia al agua y aceite, resistencia al tránsito industrial, fácil limpieza."
            }
            className={inputClass}
          />
        </label>
        <p className="mt-2 text-[11px] text-zinc-400">
          Fotos de esta sección: solución propuesta, piso terminado de
          referencia, maquinaria (pulidoras)…
        </p>
        <div className="mt-1">
          <QuotePhotosField
            section="tasks"
            existing={photosFor("tasks")}
            library={library}
          />
        </div>
      </div>

      <div className="rounded-xl border p-4 dark:border-zinc-800">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Exclusiones del alcance
          </span>
          <textarea
            name="exclusions"
            rows={4}
            maxLength={5000}
            defaultValue={quote?.exclusions ?? ""}
            className={inputClass}
          />
        </label>
        <div className="mt-2">
          <QuotePhotosField
            section="exclusions"
            existing={photosFor("exclusions")}
            library={library}
          />
        </div>
      </div>

      <div className="rounded-xl border p-4 dark:border-zinc-800">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Garantía
          </span>
          <textarea
            name="warrantyText"
            rows={2}
            maxLength={2000}
            defaultValue={quote?.warrantyText ?? ""}
            placeholder="Ej: Garantía escrita por 20 años, sujeta a recomendaciones del fabricante."
            className={inputClass}
          />
        </label>
        <p className="mt-2 text-[11px] text-zinc-400">
          Fotos de esta sección: certificación del fabricante (Ashford), la
          ciencia detrás del producto…
        </p>
        <div className="mt-1">
          <QuotePhotosField
            section="warranty"
            existing={photosFor("warranty")}
            library={library}
          />
        </div>
      </div>

      <div className="rounded-xl border p-4 dark:border-zinc-800">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Condiciones generales
          </span>
          <textarea
            name="generalConditions"
            rows={4}
            maxLength={5000}
            defaultValue={quote?.generalConditions ?? ""}
            className={inputClass}
          />
        </label>
        <div className="mt-2">
          <QuotePhotosField
            section="conditions"
            existing={photosFor("conditions")}
            library={library}
          />
        </div>
      </div>

      <div className="rounded-xl border p-4 dark:border-zinc-800">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Fotos de la propuesta (generales)
        </span>
        <p className="mb-2 text-[11px] text-zinc-400">
          Las que no van en una sección puntual: trabajos de referencia,
          estado actual del piso… Salen como sección propia antes del precio.
        </p>
        <QuotePhotosField
          section="general"
          existing={photosFor("general")}
          library={library}
        />
      </div>
    </div>
    </QuotePhotoBudget>
  );

  return (
    <form action={action} className="space-y-5">
      {quote?.id && <input type="hidden" name="id" value={quote.id} />}

      <FormSteps
        labels={["Cotización", "Obra y plazos", "Parte técnica"]}
        panes={[stepCotizacion, stepObra, stepTecnica]}
      />

      <div className="flex justify-end border-t pt-4 dark:border-zinc-800">
        <SubmitButton pendingText="Guardando…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
