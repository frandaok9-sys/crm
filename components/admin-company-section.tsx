import { getCompanySettings } from "@/lib/company";
import { IVA_LABELS } from "@/lib/clients";
import { IvaCondition } from "@/lib/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { updateCompanySettings } from "@/app/(app)/admin/empresa/actions";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

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

export async function AdminCompanySection() {
  const settings = await getCompanySettings();

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-sm text-zinc-500">
        Estos datos y el diseño base se usan en el título del sistema, los
        presupuestos y su futuro PDF (logo, información fiscal, pie de página).
      </p>

      <form action={updateCompanySettings} className="space-y-6">
        <section className="rounded-xl border bg-white p-6 dark:bg-zinc-950">
          <h2 className="mb-4 text-sm font-medium text-zinc-500">
            Datos de la empresa
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Razón social">
                <input
                  name="legalName"
                  defaultValue={settings?.legalName ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Nombre de fantasía">
              <input
                name="tradeName"
                defaultValue={settings?.tradeName ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="CUIT">
              <input
                name="taxId"
                defaultValue={settings?.taxId ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Condición IVA">
              <select
                name="ivaCondition"
                defaultValue={settings?.ivaCondition ?? ""}
                className={inputClass}
              >
                <option value="">— Sin especificar —</option>
                {Object.values(IvaCondition).map((iva) => (
                  <option key={iva} value={iva}>
                    {IVA_LABELS[iva]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Teléfono">
              <input
                name="phone"
                defaultValue={settings?.phone ?? ""}
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Dirección">
                <input
                  name="address"
                  defaultValue={settings?.address ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
            <Field label="Localidad">
              <input
                name="city"
                defaultValue={settings?.city ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Provincia">
              <input
                name="province"
                defaultValue={settings?.province ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Código postal">
              <input
                name="postalCode"
                defaultValue={settings?.postalCode ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Email">
              <input
                name="email"
                type="email"
                defaultValue={settings?.email ?? ""}
                className={inputClass}
              />
            </Field>
            <Field label="Sitio web">
              <input
                name="website"
                defaultValue={settings?.website ?? ""}
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        <section className="rounded-xl border bg-white p-6 dark:bg-zinc-950">
          <h2 className="mb-4 text-sm font-medium text-zinc-500">
            Diseño base del presupuesto (para el PDF)
          </h2>

          <div className="mb-4 flex items-center gap-4">
            {settings?.logo && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logo}
                alt="Logo actual"
                className="h-16 w-16 rounded border object-contain p-1"
              />
            )}
            <div className="flex-1">
              <Field label="Logo (PNG/JPG, máx. 800 KB)">
                <input
                  type="file"
                  name="logo"
                  accept="image/*"
                  className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:text-white dark:file:bg-zinc-100 dark:file:text-black"
                />
              </Field>
              {settings?.logo && (
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                  <input type="checkbox" name="removeLogo" />
                  Quitar el logo actual
                </label>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Color de marca">
              <input
                type="color"
                name="primaryColor"
                defaultValue={settings?.primaryColor ?? "#2563eb"}
                className="h-10 w-20 rounded border border-zinc-300 dark:border-zinc-700"
              />
            </Field>
            <Field label="Validez por defecto (días)">
              <input
                name="quoteValidity"
                inputMode="numeric"
                defaultValue={settings?.quoteValidity?.toString() ?? ""}
                placeholder="Ej: 30"
                className={inputClass}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Pie de página / condiciones por defecto">
                <textarea
                  name="quoteFooter"
                  rows={3}
                  defaultValue={settings?.quoteFooter ?? ""}
                  placeholder="Ej: Precios sujetos a modificación sin previo aviso. Validez 30 días."
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Datos de pago / banco">
                <textarea
                  name="bankInfo"
                  rows={2}
                  defaultValue={settings?.bankInfo ?? ""}
                  className={inputClass}
                />
              </Field>
            </div>
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="submit">Guardar configuración</Button>
        </div>
      </form>
    </div>
  );
}
