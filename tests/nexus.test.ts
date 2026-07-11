import { describe, it, expect } from "vitest";

import {
  normalizeCuit,
  normalizeName,
  clientIdentityKey,
  nexusRef,
  validateImportRow,
  validateImport,
  DATA_OWNER,
} from "../lib/nexus/canonical";

describe("Nexus — CUIT", () => {
  it("valida un CUIT correcto y deja solo dígitos", () => {
    const r = normalizeCuit("30-71234567-1"); // verificador válido
    expect(r.value).toBe("30712345671");
    expect(r.valid).toBe(true);
  });

  it("rechaza un CUIT con verificador incorrecto", () => {
    expect(normalizeCuit("30-71234567-9").valid).toBe(false);
  });

  it("rechaza longitudes distintas de 11", () => {
    expect(normalizeCuit("123").valid).toBe(false);
    expect(normalizeCuit(null).valid).toBe(false);
  });
});

describe("Nexus — identidad del cliente", () => {
  it("usa el CUIT como clave cuando es válido", () => {
    expect(clientIdentityKey({ cuit: "30-71234567-1", name: "X" })).toBe(
      "cuit:30712345671"
    );
  });

  it("cae a nombre normalizado + zona cuando no hay CUIT válido", () => {
    const k = clientIdentityKey({ cuit: null, name: "Bodega Norton S.A.", zone: "Luján" });
    expect(k).toBe("name:bodega norton|zone:lujan");
  });

  it("dos escrituras del mismo cliente producen la misma clave", () => {
    const a = clientIdentityKey({ name: "Metalúrgica  del Sur SRL", zone: "Mendoza" });
    const b = clientIdentityKey({ name: "metalurgica del sur s.r.l.", zone: "MENDOZA" });
    expect(a).toBe(b);
  });
});

describe("Nexus — normalizeName", () => {
  it("saca acentos, sufijos societarios y ruido", () => {
    expect(normalizeName("Áridos del Oeste S.A.")).toBe("aridos del oeste");
  });
});

describe("Nexus — par nexus_id / external_id", () => {
  it("expone el id como nexus_id y el externalId", () => {
    expect(nexusRef({ id: "abc", externalId: "SF-99" })).toEqual({
      nexusId: "abc",
      externalId: "SF-99",
    });
    expect(nexusRef({ id: "abc" }).externalId).toBeNull();
  });
});

describe("Nexus — matriz de dueño del dato", () => {
  it("la cartera del cliente la manda su sistema; las oportunidades, la central", () => {
    expect(DATA_OWNER.client).toBe("external");
    expect(DATA_OWNER.opportunity).toBe("central");
  });
});

describe("Nexus — validador de importación", () => {
  it("marca columnas obligatorias vacías", () => {
    const errs = validateImportRow("clientes", { razon_social: "" });
    expect(errs.some((e) => e.column === "razon_social")).toBe(true);
  });

  it("valida CUIT y moneda cuando vienen", () => {
    const errs = validateImportRow("clientes", {
      razon_social: "Bodega X",
      cuit: "123",
      moneda: "EUR",
    });
    expect(errs.some((e) => e.column === "cuit")).toBe(true);
    expect(errs.some((e) => e.column === "moneda")).toBe(true);
  });

  it("acepta una fila correcta", () => {
    expect(
      validateImportRow("clientes", { razon_social: "Bodega X", cuit: "30-71234567-1" })
    ).toEqual([]);
  });

  it("resume una planilla e indica el número de fila (con encabezado)", () => {
    const v = validateImport("productos", [
      { nombre: "Epoxi", precio: "1000" },
      { nombre: "", precio: "abc" },
    ]);
    expect(v.total).toBe(2);
    expect(v.valid).toBe(1);
    expect(v.invalid).toBe(1);
    expect(v.errors[0].row).toBe(3); // fila 2 de datos = fila 3 con encabezado
  });
});
