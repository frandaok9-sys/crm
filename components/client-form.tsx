import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { IVA_LABELS, SEGMENT_LABELS } from "@/lib/clients";
import { IvaCondition, ClientSegment } from "@/lib/generated/prisma/enums";

type ClientDefaults = {
  id?: string;
  legalName?: string | null;
  tradeName?: string | null;
  taxId?: string | null;
  ivaCondition?: IvaCondition | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  industry?: string | null;
  segment?: ClientSegment | null;
  notes?: string | null;
};

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
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

export function ClientForm({
  action,
  client,
  submitLabel,
  extraFields,
}: {
  action: (formData: FormData) => Promise<void>;
  client?: ClientDefaults;
  submitLabel: string;
  extraFields?: ReactNode;
}) {
  return (
    <form action={action} className="space-y-4">
      {client?.id && <input type="hidden" name="id" value={client.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label="Razón social *">
            <input
              name="legalName"
              required
              defaultValue={client?.legalName ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Nombre de fantasía">
          <input
            name="tradeName"
            defaultValue={client?.tradeName ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="CUIT">
          <input
            name="taxId"
            defaultValue={client?.taxId ?? ""}
            placeholder="30-12345678-9"
            className={inputClass}
          />
        </Field>
        <Field label="Condición IVA">
          <select
            name="ivaCondition"
            defaultValue={client?.ivaCondition ?? ""}
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
        <Field label="Segmento">
          <select
            name="segment"
            defaultValue={client?.segment ?? ""}
            className={inputClass}
          >
            <option value="">— Sin especificar —</option>
            {Object.values(ClientSegment).map((segment) => (
              <option key={segment} value={segment}>
                {SEGMENT_LABELS[segment]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rubro (detalle)">
          <input
            name="industry"
            defaultValue={client?.industry ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Email">
          <input
            name="email"
            type="email"
            defaultValue={client?.email ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Teléfono">
          <input
            name="phone"
            defaultValue={client?.phone ?? ""}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Dirección">
            <input
              name="address"
              defaultValue={client?.address ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Localidad">
          <input
            name="city"
            defaultValue={client?.city ?? ""}
            className={inputClass}
          />
        </Field>
        <Field label="Provincia">
          <input
            name="province"
            defaultValue={client?.province ?? ""}
            className={inputClass}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Notas">
            <textarea
              name="notes"
              rows={3}
              defaultValue={client?.notes ?? ""}
              className={inputClass}
            />
          </Field>
        </div>
      </div>

      {extraFields}

      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
