import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireActiveUser } from "@/lib/auth";
import {
  clientScope,
  canViewAllRecords,
  canCreateClients,
} from "@/lib/permissions";
import { IVA_LABELS } from "@/lib/clients";
import { Button } from "@/components/ui/button";

export default async function ClientsPage() {
  const user = await requireActiveUser();
  const showOwner = canViewAllRecords(user);
  const canCreate = canCreateClients(user);

  const clients = await prisma.client.findMany({
    where: clientScope(user),
    include: {
      owner: { select: { name: true, email: true } },
      _count: { select: { contacts: true } },
    },
    orderBy: { legalName: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {showOwner
              ? `${clients.length} cliente(s) en la cartera general.`
              : `${clients.length} cliente(s) en tu cartera.`}
          </p>
        </div>
        {canCreate && (
          <div className="flex gap-2">
            <Link href="/clientes/importar">
              <Button variant="outline">Importar Excel</Button>
            </Link>
            <Link href="/clientes/nuevo">
              <Button>Nuevo cliente</Button>
            </Link>
          </div>
        )}
      </div>

      {clients.length === 0 ? (
        <div className="rounded-xl border bg-white p-10 text-center text-sm text-zinc-500 dark:bg-zinc-950">
          Todavía no hay clientes.
          {canCreate && " Creá el primero con el botón “Nuevo cliente”."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-950">
          <table className="w-full text-sm">
            <thead className="border-b bg-zinc-50 text-left text-xs uppercase text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-3 font-medium">Razón social</th>
                <th className="px-4 py-3 font-medium">CUIT</th>
                <th className="px-4 py-3 font-medium">Condición IVA</th>
                <th className="px-4 py-3 font-medium">Localidad</th>
                <th className="px-4 py-3 font-medium">Contactos</th>
                {showOwner && <th className="px-4 py-3 font-medium">Vendedor</th>}
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/clientes/${client.id}`}
                      className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {client.legalName}
                    </Link>
                    {client.tradeName && (
                      <div className="text-xs text-zinc-500">
                        {client.tradeName}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">{client.taxId ?? "—"}</td>
                  <td className="px-4 py-3">
                    {client.ivaCondition ? IVA_LABELS[client.ivaCondition] : "—"}
                  </td>
                  <td className="px-4 py-3">{client.city ?? "—"}</td>
                  <td className="px-4 py-3">{client._count.contacts}</td>
                  {showOwner && (
                    <td className="px-4 py-3">
                      {client.owner ? (
                        client.owner.name ?? client.owner.email
                      ) : (
                        <span className="text-zinc-400">Sin asignar</span>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
