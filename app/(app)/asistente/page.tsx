// Consultas con varias rondas de herramientas (+ búsqueda web) pueden pasar
// el límite serverless por defecto; el chat hereda este tope.
export const maxDuration = 60;

import { requireActiveUser } from "@/lib/auth";
import { TintBadge } from "@/components/tint-badge";
import { AssistantChat } from "@/components/assistant-chat";

export default async function AssistantPage() {
  const user = await requireActiveUser();

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-[26px] font-semibold leading-tight">
            Asistente IA
            <TintBadge variant="amber">Demo interno</TintBadge>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Preguntale por clientes, oportunidades, presupuestos o métricas, o
            pedile que te arme una hoja de ruta de visitas. Solo consulta —
            salvo armar hojas de ruta, no crea ni edita nada más. Todavía no
            está conectado a WhatsApp.
          </p>
        </div>
      </div>

      <AssistantChat userName={user.name ?? user.email ?? "Vos"} />
    </div>
  );
}
