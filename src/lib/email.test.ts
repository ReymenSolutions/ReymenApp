// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";

describe("sendEmail sin RESEND_API_KEY (AUD-011)", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); });

  it("en producción no registra el contenido (enlaces de recuperación) en los logs", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "production");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { sendEmail } = await import("./email");
    const out = await sendEmail({ to: "a@b.c", subject: "Recupera tu contraseña", html: "<a href='https://x/reset?token=SECRETO'>enlace</a>", text: "https://x/reset?token=SECRETO" });
    expect(out.sent).toBe(false);
    expect(JSON.stringify([...log.mock.calls, ...error.mock.calls])).not.toContain("SECRETO");
  });

  it("en desarrollo sí muestra el contenido para poder probar el flujo", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { sendEmail } = await import("./email");
    await sendEmail({ to: "a@b.c", subject: "x", html: "<p>hola</p>", text: "token=ABC" });
    expect(JSON.stringify(log.mock.calls)).toContain("token=ABC");
  });
});
