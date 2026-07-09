import { getCompanySettings } from "@/lib/company";
import { IVA_LABELS } from "@/lib/clients";
import { IvaCondition } from "@/lib/generated/prisma/enums";
import { SubmitButton } from "@/components/submit-button";
import { updateCompanySettings } from "@/app/(app)/admin/empresa/actions";

const inputClass =
  "w-full rounded-[8px] border border-border bg-field px-3 py-2 text-sm outline-none transition-colors focus:border-muted-foreground";

function Field({
  label,
  children,
  span2,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <label className={`block ${span2 ? "sm:col-span-2" : ""}`}>
      <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

export async function AdminCompanySection() {
  const settings = await getCompanySettings();

  return (
    <form action={updateCompanySettings} className="space-y-4">
      <div className="grid items-start gap-[14px] lg:grid-cols-[1.4fr_1fr]">
        {/* Datos de la empresa */}
        <section className="rounded-[12px] border bg-card p-5">
          <h2 className="mb-4 text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
            Datos de la empresa
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Razón social" span2>
              <input
                name="legalName"
                defaultValue={settings?.legalName ?? ""}
                className={inputClass}
              />
            </Field>
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
            <Field label="Dirección" span2>
              <input
                name="address"
                defaultValue={settings?.address ?? ""}
                className={inputClass}
              />
            </Field>
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
            <Field label="Color de marca">
              <input
                type="color"
                name="primaryColor"
                defaultValue={settings?.primaryColor ?? "#E0503A"}
                className="h-10 w-20 rounded-[8px] border border-border bg-field"
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
            <Field label="Pie de página / condiciones por defecto" span2>
              <textarea
                name="quoteFooter"
                rows={3}
                defaultValue={settings?.quoteFooter ?? ""}
                placeholder="Ej: Precios sujetos a modificación sin previo aviso."
                className={inputClass}
              />
            </Field>
            <Field label="Datos de pago / banco" span2>
              <textarea
                name="bankInfo"
                rows={2}
                defaultValue={settings?.bankInfo ?? ""}
                className={inputClass}
              />
            </Field>
          </div>
        </section>

        {/* Logo */}
        <section className="rounded-[12px] border bg-card p-5">
          <h2 className="mb-4 text-[13px] font-semibold tracking-[0.06em] text-muted-foreground">
            Logo
          </h2>
          <label className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-3 rounded-[10px] border border-dashed border-avbd p-4 transition-colors hover:border-muted-foreground">
            {settings?.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={settings.logo}
                alt="Logo actual"
                className="max-h-20 w-auto"
              />
            ) : (
              <span className="text-sm text-muted2">
                Subí el logo (PNG/JPG, máx. 800 KB)
              </span>
            )}
            <input type="file" name="logo" accept="image/*" className="hidden" />
            <span className="text-xs font-semibold text-primary">
              Elegir archivo
            </span>
          </label>
          {settings?.logo && (
            <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="removeLogo" />
              Quitar el logo actual
            </label>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Se muestra en la cabecera y en los PDF de presupuestos.
          </p>
        </section>
      </div>

      <div className="flex justify-end">
        <SubmitButton size="cta" pendingText="Guardando…">
          Guardar cambios
        </SubmitButton>
      </div>
    </form>
  );
}
