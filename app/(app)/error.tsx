"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Pantalla de error para todo el grupo (app): ante una falla (base caída,
 * timeout) muestra un mensaje claro y un botón de reintento, en lugar del
 * error genérico de Next.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Error de módulo:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-20 text-center">
      <div className="text-3xl">⚠️</div>
      <h1 className="text-lg font-semibold">Algo salió mal al cargar esta sección</h1>
      <p className="text-sm text-muted-foreground">
        Puede ser un problema momentáneo de conexión con la base de datos.
        Reintentá; si sigue pasando, avisale al administrador.
        {error.digest && (
          <span className="mt-2 block text-xs text-muted2">Código: {error.digest}</span>
        )}
      </p>
      <Button onClick={reset}>Reintentar</Button>
    </div>
  );
}
