import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { UserError, getErrorMessage, translateMessage } from "./user-error";
import { translateServerMessage } from "./server-messages";

function setLang(lang: string) {
  document.documentElement.lang = lang;
}

describe("UserError / getErrorMessage", () => {
  afterEach(() => setLang("es"));

  it("keeps the message in the digest, which Next.js does pass to the browser in production", () => {
    const err = new UserError("Ya existe un usuario con ese email");
    expect(err.message).toBe("Ya existe un usuario con ese email");
    expect(err.digest.startsWith("reymen-user-error:")).toBe(true);
  });

  it("recovers the message from the digest even when the message was replaced (production)", () => {
    const masked = Object.assign(new Error("Minified React error #441; visit https://react.dev/errors/441"), {
      digest: new UserError("Sin permisos").digest,
    });
    setLang("es");
    expect(getErrorMessage(masked, "fallback")).toBe("Sin permisos");
    setLang("en");
    expect(getErrorMessage(masked, "fallback")).toBe("Not allowed");
  });

  it("never shows React's generic production message; uses the fallback instead", () => {
    const masked = Object.assign(new Error("Minified React error #441"), { digest: "12345" });
    expect(getErrorMessage(masked, "Error al guardar")).toBe("Error al guardar");
    expect(getErrorMessage("not an error", "Error al guardar")).toBe("Error al guardar");
  });

  it("translates dynamic messages and English-origin ones", () => {
    expect(translateServerMessage("Alcanzaste el límite de usuarios de tu plan (2). Solicita más capacidad en Configuración.", "en"))
      .toBe("You reached your plan's users limit (2). Request more capacity in Settings.");
    expect(translateServerMessage("Unauthorized", "es")).toBe("No autorizado");
    expect(translateServerMessage("El código debe tener entre 1 y 80 caracteres.", "en"))
      .toBe("The code must be between 1 and 80 characters.");
    expect(translateServerMessage("El precio debe ser un importe no negativo con hasta dos decimales.", "en"))
      .toBe("The price must be a non-negative amount with up to two decimal places.");
    setLang("en");
    expect(translateMessage("Mínimo 8 caracteres")).toBe("At least 8 characters");
  });
});

// Si alguien agrega un mensaje de error nuevo sin su traducción, esta prueba
// lo detecta: recorre el código buscando los textos que llegan al usuario.
describe("every user-facing message has an English translation", () => {
  const root = join(__dirname, "..");
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return walk(full);
      return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) && !/i18n/.test(name) ? [full] : [];
    });
  }
  const patterns = [
    /throw new UserError\(\s*"((?:[^"\\]|\\.)*)"/g,
    /\.(?:min|max|email|url|regex|length|positive|nonnegative|int)\([^()]*?"((?:[^"\\]|\\.)*[a-záéíóúñ]{3}(?:[^"\\]|\\.)*)"\s*\)/g,
    /required_error:\s*"((?:[^"\\]|\\.)*)"/g,
  ];
  const missing = new Set<string>();
  for (const file of walk(root)) {
    const src = readFileSync(file, "utf8");
    for (const pattern of patterns) {
      for (const m of src.matchAll(pattern)) {
        const msg = m[1];
        if (msg.endsWith(": ")) continue; // prefijo que se completa en tiempo de ejecución (ver EN_PATTERNS)
        if (translateServerMessage(msg, "en") === msg && /[áéíóúñ]|\b(no|el|la|de|un|una)\b/i.test(msg)) missing.add(`${msg}  (${file.replace(root, "src")})`);
      }
    }
  }

  it("has no untranslated messages", () => {
    expect([...missing]).toEqual([]);
  });
});
