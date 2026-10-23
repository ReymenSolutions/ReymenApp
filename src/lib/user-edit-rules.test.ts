import { describe, it, expect } from "vitest";
import { checkUserEdit } from "./user-edit-rules";

const org = "org_1";
const base = { activeSuperAdmins: 2 };

describe("checkUserEdit", () => {
  it("un super admin puede cambiar el rol de un usuario de una organización", () => {
    expect(checkUserEdit({ ...base, actor: { id: "a", role: "SUPER_ADMIN" }, target: { id: "u", role: "AGENT", organizationId: org }, next: { role: "MANAGER", organizationId: org } })).toBeNull();
  });
  it("un admin puede editar a un usuario de cliente, pero no a un administrador de la plataforma ni asignar ese rol", () => {
    const actor = { id: "a", role: "ADMIN" };
    expect(checkUserEdit({ ...base, actor, target: { id: "u", role: "AGENT", organizationId: org }, next: { role: "VIEWER", organizationId: org } })).toBeNull();
    expect(checkUserEdit({ ...base, actor, target: { id: "u", role: "ADMIN", organizationId: null }, next: { role: "ADMIN", organizationId: null } })).toMatch(/super administrador/i);
    expect(checkUserEdit({ ...base, actor, target: { id: "u", role: "AGENT", organizationId: org }, next: { role: "SUPER_ADMIN", organizationId: org } })).toMatch(/super administrador/i);
  });
  it("un super admin puede ser además dueño/miembro de una organización (SUPER_ADMIN con organización)", () => {
    expect(checkUserEdit({ ...base, actor: { id: "a", role: "SUPER_ADMIN" }, target: { id: "u", role: "OWNER", organizationId: org }, next: { role: "SUPER_ADMIN", organizationId: org } })).toBeNull();
  });
  it("un rol de cliente exige organización; uno de plataforma no", () => {
    const actor = { id: "a", role: "SUPER_ADMIN" };
    expect(checkUserEdit({ ...base, actor, target: { id: "u", role: "ADMIN", organizationId: null }, next: { role: "OWNER", organizationId: null } })).toMatch(/necesita una organización/i);
    expect(checkUserEdit({ ...base, actor, target: { id: "u", role: "OWNER", organizationId: org }, next: { role: "ADMIN", organizationId: null } })).toBeNull();
  });
  it("nadie cambia su propio rol, y un usuario de cliente no cambia su propia organización", () => {
    const actor = { id: "a", role: "SUPER_ADMIN" };
    expect(checkUserEdit({ ...base, actor, target: { id: "a", role: "SUPER_ADMIN", organizationId: null }, next: { role: "ADMIN", organizationId: null } })).toMatch(/propio rol/i);
    expect(checkUserEdit({ ...base, actor, target: { id: "a", role: "SUPER_ADMIN", organizationId: null }, next: { role: "SUPER_ADMIN", organizationId: org } })).toBeNull();
  });
  it("no se puede dejar la plataforma sin super administrador", () => {
    expect(checkUserEdit({ activeSuperAdmins: 1, actor: { id: "a", role: "SUPER_ADMIN" }, target: { id: "u", role: "SUPER_ADMIN", organizationId: null }, next: { role: "ADMIN", organizationId: null } })).toMatch(/al menos un super/i);
  });
});
