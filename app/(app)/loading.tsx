/**
 * Esqueleto de carga para TODO el grupo (app): al navegar entre módulos se ve
 * una estructura al instante en lugar de una pestaña congelada mientras la
 * base responde (clave con carteras grandes).
 */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-5" aria-busy="true" aria-label="Cargando…">
      <div className="space-y-2">
        <div className="h-7 w-52 rounded-md bg-black/[0.07] dark:bg-white/[0.08]" />
        <div className="h-4 w-72 rounded-md bg-black/[0.05] dark:bg-white/[0.06]" />
      </div>
      <div className="h-11 w-full max-w-[380px] rounded-[10px] bg-black/[0.05] dark:bg-white/[0.06]" />
      <div className="overflow-hidden rounded-[12px] border bg-card">
        <div className="h-10 border-b border-border2 bg-black/[0.03] dark:bg-white/[0.04]" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="border-b border-border2 px-5 py-[14px] last:border-0">
            <div
              className="h-4 rounded bg-black/[0.05] dark:bg-white/[0.06]"
              style={{ width: `${88 - (i % 4) * 14}%` }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
