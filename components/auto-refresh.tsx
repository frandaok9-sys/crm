"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Refresca los datos del servidor cada `seconds` segundos SIN recargar la
 * página: notificaciones, Mis tareas, chats de tareas y contadores se
 * actualizan solos. Para no molestar, se saltea el refresco si la pestaña
 * está en segundo plano o si el usuario está escribiendo en un campo
 * (lo tipeado no se pierde, pero mejor ni interrumpir). Al volver a la
 * pestaña, refresca al instante para ponerse al día.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return (
        !!el && ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)
      );
    };

    const tick = () => {
      if (document.hidden || isTyping()) return;
      router.refresh();
    };

    const id = setInterval(tick, seconds * 1000);

    const onVisible = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  return null;
}
