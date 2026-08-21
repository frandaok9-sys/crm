import { requireActiveUser } from "@/lib/auth";
import { getNavItems } from "@/lib/nav";
import { getNotifications } from "@/lib/alerts";
import { APP_GROUP_LABELS, APP_GROUP_ORDER } from "@/lib/nav-registry";
import { todayKickerAR } from "@/lib/dates";
import { AppTile } from "@/components/app-tile";
import { RecentApps } from "@/components/recent-apps";
import { NotificationsPanel } from "@/components/notifications-panel";

/**
 * Escritorio de aplicaciones: la pantalla de entrada al sistema. Todo lo que
 * antes vivía en la barra lateral está acá como "apps" en cuadrados, por
 * grupo y con sus contadores. Solo muestra lo que el usuario puede abrir
 * (misma capa de permisos que cada módulo). Al lado del saludo, las
 * novedades con detalle, desplegables (mismas que la campanita del Inicio).
 */
export default async function AppsPage() {
  const user = await requireActiveUser();
  const [items, notifications] = await Promise.all([
    getNavItems(user),
    getNotifications(user),
  ]);
  const firstName = (user.name ?? user.email ?? "").split(" ")[0];

  return (
    <div className="space-y-7">
      {/* Saludo a la izquierda, novedades a la derecha (en el celular, debajo). */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">
            {todayKickerAR()}
          </p>
          <h1 className="mt-1 text-[30px] font-semibold leading-tight">
            Hola, {firstName}
          </h1>
        </div>
        <div className="w-full lg:w-[380px]">
          <NotificationsPanel items={notifications} />
        </div>
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
