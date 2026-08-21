"use client";

import type { ButtonHTMLAttributes } from "react";

/**
 * Botón de borrado con confirmación en dos pasos: pide un "¿Seguro?" antes
 * de enviar el formulario que lo contiene, para evitar borrados por un toque
 * accidental (sobre todo en el celular). El servidor sigue validando permisos.
 */
export function ConfirmDeleteButton({
  message = "¿Eliminar este registro? Esta acción no se puede deshacer.",
  children,
  onClick,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { message?: string }) {
  return (
    <button
      type="submit"
      {...props}
      onClick={(e) => {
        if (!confirm(message)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    >
      {children}
    </button>
  );
}
