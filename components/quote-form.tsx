import { Button } from "@/components/ui/button";
import { ClientCombobox } from "@/components/client-combobox";
import { QuoteItemsEditor, type QuoteRow } from "@/components/quote-items-editor";
import { Currency } from "@/lib/generated/prisma/enums";

const inputClass =
  "w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800";

type Owner = { id: string; name: string | null; email: string };

export type QuoteFormData = {
  id?: string;
  clientId?: string;
  clientLegalName?: string;
  currency?: Currency;
  validUntil?: string; // yyyy-mm-dd
  notes?: string | null;
  ownerId?: string | null;
  items?: QuoteRow[];
};

export function QuoteForm({
  action,
  clients,
  taxRates,
  defaultRate,
  canAssign,
  owners,
  submitLabel,
  quote,
}: {
  action: (formData: FormData) => Promise<void>;
  clients: { id: string; legalName: string }[];
  taxRates: { rate: string; name: string }[];
  defaultRate: string;
  canAssign: boolean;
  owners: Owner[];
  submitLabel: string;
  quote?: QuoteFormData;
}) {
  const currency = quote?.currency ?? Currency.ARS;
  const symbol = currency === Currency.USD ? "US$" : "$";

  return (
    <form action={action} className="space-y-5">
      {quote?.id && <input type="hidden" name="id" value={quote.id} />}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Cliente *
          </span>
          <ClientCombobox
            clients={clients}
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

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Válido hasta
          </span>
          <input
            type="date"
            name="validUntil"
            defaultValue={quote?.validUntil ?? ""}
            className={inputClass}
          />
        </label>

        {canAssign && (
          <label className="block sm:col-span-2">
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
        />
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-zinc-500">
          Notas / condiciones
        </span>
        <textarea name="notes" rows={3} defaultValue={quote?.notes ?? ""} className={inputClass} />
      </label>

      <div className="flex justify-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
