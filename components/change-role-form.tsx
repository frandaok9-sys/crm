"use client";

import { ROLE_LABELS } from "@/lib/permissions";
import { Role } from "@/lib/generated/prisma/enums";
import { SubmitButton } from "@/components/submit-button";

/**
 * Cambiar el rol de un usuario. Avisa antes: al guardar, los permisos se
 * REEMPLAZAN por los del rol elegido — si alguien tenía permisos ajustados
 * a mano (por ejemplo "ver toda la cartera"), los pierde sin darse cuenta.
 */
export function ChangeRoleForm({
  action,
  userId,
  userLabel,
  defaultRole,
}: {
  action: (formData: FormData) => Promise<void>;
  userId: string;
  userLabel: string;
  defaultRole?: Role;
}) {
  return (
    <form
      action={action}
      className="flex items-center gap-2"
      onSubmit={(e) => {
        if (
          !confirm(
            `Al cambiar el rol, los permisos de ${userLabel} se reemplazan por los del rol elegido.\n\nSi tenía permisos ajustados a mano (por ejemplo "ver toda la cartera"), se pierden y hay que volver a marcarlos en "Permisos".\n\n¿Continuar?`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="userId" value={userId} />
      <select
        name="role"
        defaultValue={defaultRole ?? Role.SALES}
        className="rounded-[9px] border border-border bg-field px-2.5 py-1.5 text-[12.5px]"
      >
        {Object.values(Role).map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
      <SubmitButton
        size="sm"
        variant="ghost"
        pendingText="…"
        className="h-auto p-0 text-[12.5px] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground"
      >
        Guardar
      </SubmitButton>
    </form>
  );
}
