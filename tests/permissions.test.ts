import { describe, it, expect } from "vitest";

import {
  hasPermission,
  canViewAllRecords,
  canCreateQuotes,
  canManageLedger,
  canManageUsers,
  canEditClient,
  canCreateTrips,
  canManageTrip,
  clientScope,
  ROLE_DEFAULT_PERMISSIONS,
  type Principal,
} from "../lib/permissions";
import { Role, UserStatus } from "../lib/generated/prisma/enums";

function principal(
  role: Role | null,
  permissions: string[] = role ? ROLE_DEFAULT_PERMISSIONS[role] : [],
  status: UserStatus = UserStatus.ACTIVE
): Principal {
  return { id: "u1", role, status, permissions };
}

describe("permission layer", () => {
  it("ADMIN bypasses every check", () => {
    const admin = principal(Role.ADMIN, []); // sin permisos explícitos
    expect(canManageUsers(admin)).toBe(true);
    expect(canManageLedger(admin)).toBe(true);
    expect(canViewAllRecords(admin)).toBe(true);
  });

  it("SALES defaults: manages own commercial records, no finance/admin", () => {
    const sales = principal(Role.SALES);
    expect(canCreateQuotes(sales)).toBe(true);
    expect(canViewAllRecords(sales)).toBe(false);
    expect(canManageLedger(sales)).toBe(false);
    expect(canManageUsers(sales)).toBe(false);
    expect(clientScope(sales)).toEqual({ ownerId: "u1" });
  });

  it("ADMINISTRATION defaults: finance + view all, no quote editing", () => {
    const adm = principal(Role.ADMINISTRATION);
    expect(canManageLedger(adm)).toBe(true);
    expect(canViewAllRecords(adm)).toBe(true);
    expect(canCreateQuotes(adm)).toBe(false);
    expect(clientScope(adm)).toEqual({});
  });

  it("manual grants extend a user beyond their role package", () => {
    const salesPlus = principal(Role.SALES, [
      ...ROLE_DEFAULT_PERMISSIONS[Role.SALES],
      "ledger.manage",
    ]);
    expect(canManageLedger(salesPlus)).toBe(true);
  });

  it("manual revokes remove a role-default capability", () => {
    const salesSinPresupuestos = principal(Role.SALES, [
      "clients.manage",
      "opportunities.manage",
    ]);
    expect(canCreateQuotes(salesSinPresupuestos)).toBe(false);
  });

  it("ownership still gates editing without view-all", () => {
    const sales = principal(Role.SALES);
    expect(canEditClient(sales, { ownerId: "u1" })).toBe(true);
    expect(canEditClient(sales, { ownerId: "otro" })).toBe(false);
    const manager = principal(Role.MANAGER);
    expect(canEditClient(manager, { ownerId: "otro" })).toBe(true);
  });

  it("inactive users are always denied", () => {
    const pending = principal(
      Role.ADMIN,
      ROLE_DEFAULT_PERMISSIONS[Role.ADMIN],
      UserStatus.PENDING
    );
    expect(hasPermission(pending, "clients.manage")).toBe(false);
    expect(canManageUsers(pending)).toBe(false);
  });
});

describe("hojas de ruta (SavedTrip)", () => {
  it("crear: vendedor/gerente/admin sí; Solo lectura y Administración no", () => {
    expect(canCreateTrips(principal(Role.SALES))).toBe(true);
    expect(canCreateTrips(principal(Role.MANAGER))).toBe(true);
    expect(canCreateTrips(principal(Role.ADMIN, []))).toBe(true);
    expect(canCreateTrips(principal(Role.READ_ONLY))).toBe(false);
    expect(canCreateTrips(principal(Role.ADMINISTRATION))).toBe(false);
  });

  it("editar/borrar: el dueño sí, otro vendedor no", () => {
    const sales = principal(Role.SALES);
    expect(canManageTrip(sales, { ownerId: "u1" })).toBe(true);
    expect(canManageTrip(sales, { ownerId: "otro" })).toBe(false);
  });

  it("editar/borrar ajenas: gerente/admin sí; 'ver todo' NO alcanza (el bug)", () => {
    expect(canManageTrip(principal(Role.MANAGER), { ownerId: "otro" })).toBe(true);
    expect(canManageTrip(principal(Role.ADMIN, []), { ownerId: "otro" })).toBe(true);
    // READ_ONLY y ADMINISTRATION tienen records.view_all, pero no gestionan hojas.
    expect(canManageTrip(principal(Role.READ_ONLY), { ownerId: "otro" })).toBe(false);
    expect(canManageTrip(principal(Role.ADMINISTRATION), { ownerId: "otro" })).toBe(false);
  });
});
