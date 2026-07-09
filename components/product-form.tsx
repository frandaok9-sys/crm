import { SubmitButton } from "@/components/submit-button";
import { Currency } from "@/lib/generated/prisma/enums";

const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

export type ProductFormData = {
  id?: string;
  name?: string;
  brand?: string | null;
  sku?: string | null;
  description?: string | null;
  unit?: string;
  price?: string;
  currency?: Currency;
  ivaRate?: string;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">
        {label}
      </span>
      {children}
    </label>
  );
}

export function ProductForm({
  action,
  product,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  product?: ProductFormData;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-4">
      {product?.id && <input type="hidden" name="id" value={product.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Nombre del producto *">
            <input
              name="name"
              required
              defaultValue={product?.name ?? ""}
              placeholder="Ej: Ashford Formula x 208 L"
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Marca / proveedor">
          <input
            name="brand"
            defaultValue={product?.brand ?? ""}
            placeholder="Sinteplast, Ashford…"
            list="brand-suggestions"
            className={inputClass}
          />
          <datalist id="brand-suggestions">
            <option value="Sinteplast" />
            <option value="Ashford" />
          </datalist>
        </Field>
        <Field label="Código">
          <input
            name="sku"
            defaultValue={product?.sku ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Unidad">
          <input
            name="unit"
            defaultValue={product?.unit ?? "un"}
            placeholder="un, L, kg, m²…"
            className={inputClass}
          />
        </Field>
        <Field label="Precio (sin IVA)">
          <input
            name="price"
            inputMode="decimal"
            defaultValue={product?.price ?? ""}
            placeholder="0.00"
            className={inputClass}
          />
        </Field>
        <Field label="Moneda">
          <select
            name="currency"
            defaultValue={product?.currency ?? Currency.ARS}
            className={inputClass}
          >
            <option value={Currency.ARS}>Pesos (ARS)</option>
            <option value={Currency.USD}>Dólares (USD)</option>
          </select>
        </Field>
        <Field label="IVA %">
          <input
            name="ivaRate"
            inputMode="decimal"
            defaultValue={product?.ivaRate ?? "21"}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Descripción">
            <textarea
              name="description"
              rows={2}
              defaultValue={product?.description ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
      </div>
      <div className="flex justify-end">
        <SubmitButton pendingText="Guardando…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
