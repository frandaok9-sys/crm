import { describe, it, expect, beforeAll } from "vitest";

import { ROLE_DEFAULT_PERMISSIONS, type Principal } from "../lib/permissions";
import { Role, UserStatus } from "../lib/generated/prisma/enums";

// assistant-tools importa lib/prisma, que exige DATABASE_URL para instanciarse
// (no conecta hasta ejecutar una query). Seteamos una URL dummy antes de
// importar dinámicamente: solo probamos funciones puras de permisos.
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/db";

let toolsForUser: (typeof import("../lib/assistant-tools"))["toolsForUser"];
let describeScope: (typeof import("../lib/assistant-tools"))["describeScope"];

beforeAll(async () => {
  const mod = await import("../lib/assistant-tools");
  toolsForUser = mod.toolsForUser;
  describeScope = mod.describeScope;
});

function principal(
  role: Role | null,
  permissions: string[] = role ? ROLE_DEFAULT_PERMISSIONS[role] : []
): Principal {
  return { id: "u1", role, status: UserStatus.ACTIVE, permissions };
}

describe("asistente — CAPA 1: herramientas visibles según permiso", () => {
  it("ADMIN ve todas las herramientas, incluida cobranzas", () => {
    const names = toolsForUser(principal(Role.ADMIN, [])).map((t) => t.name);
    expect(names).toContain("cobranzas");
    expect(names).toContain("metricas");
    expect(names).toContain("productos");
  });

  it("SALES no ve cobranzas (sin ledger.manage), sí las comerciales y el catálogo", () => {
    const names = toolsForUser(principal(Role.SALES)).map((t) => t.name);
    expect(names).not.toContain("cobranzas");
    expect(names).toContain("buscar_clientes");
    expect(names).toContain("pipeline_oportunidades");
    expect(names).toContain("presupuestos");
    expect(names).toContain("productos");
  });

  it("ADMINISTRATION ve cobranzas (tiene ledger.manage)", () => {
    const names = toolsForUser(principal(Role.ADMINISTRATION)).map((t) => t.name);
    expect(names).toContain("cobranzas");
  });

  it("READ_ONLY ve consultas pero no cobranzas", () => {
    const names = toolsForUser(principal(Role.READ_ONLY)).map((t) => t.name);
    expect(names).toContain("resumen_cartera");
    expect(names).not.toContain("cobranzas");
  });
});

describe("asistente — alcance descrito para el prompt", () => {
  it("vendedor: solo su cartera y sin cobranzas", () => {
    const scope = describeScope(principal(Role.SALES));
    expect(scope).toMatch(/solo su propia cartera/i);
    expect(scope).toMatch(/no tiene acceso a cuentas por cobrar/i);
  });

  it("gerente: ve toda la empresa", () => {
    const scope = describeScope(principal(Role.MANAGER));
    expect(scope).toMatch(/toda la empresa/i);
  });
});
