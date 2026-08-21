import { requireActiveUser } from "@/lib/auth";
import { getNavItems } from "@/lib/nav";
import { APP_GROUP_LABELS, APP_GROUP_ORDER } from "@/lib/nav-registry";
import { todayKickerAR } from "@/lib/dates";
import { AppTile } from "@/components/app-tile";
import { RecentApps } from "@/components/recent-apps";

/**
 * Escritorio de aplicaciones: la pantalla de entrada al sistema. Todo lo que
 * antes vivía en la barra lateral está acá como "apps" en cuadrados, por
 * grupo y con sus contadores. Solo muestra lo que el usuario puede abrir
 * (misma capa de permisos que cada módulo).
 */
export default async function AppsPage() {
  const user = await requireActiveUser();
  const items = await getNavItems(user);
  const firstName = (user.name ?? user.email ?? "").split(" ")[0];

  return (
    <div className="space-y-7">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
          {todayKickerAR()}
        </p>
        <h1 className="mt-1 text-[30px] font-semibold leading-tight">
          Hola, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Elegí una aplicación. Desde cualquier pantalla volvés acá con el logo
          o el botón ⊞ del dock; con el buscador de arriba (o Ctrl K) saltás
          directo a otra app.
        </p>
      </div>

      <RecentApps items={items} />

      {APP_GROUP_ORDER.map((group) => {
        const apps = items.filter((i) => i.group === group);
        if (apps.length === 0) return null;
        return (
          <section key={group}>
            <h2 className="mb-3 text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
              {APP_GROUP_LABELS[group]}
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(150px,1fr))] sm:gap-[14px]">
              {apps.map((item) => (
                <AppTile key={item.href} item={item} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
