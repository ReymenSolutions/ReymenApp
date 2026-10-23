#!/usr/bin/env python3
"""Read-only model availability check; never sends messages or prints credentials."""
import json
import pathlib
import re
import stat
import sys
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def main():
    env = pathlib.Path(__file__).resolve().parents[2] / ".env.staging"
    if env.is_symlink() or not env.is_file() or stat.S_IMODE(env.stat().st_mode) & 0o077:
        raise ValueError("Se requiere .env.staging regular con permisos 600.")
    values = {}
    for line in env.read_text().splitlines():
        name, separator, value = line.partition("=")
        if separator and name in ("STAGING_MARK_MODEL", "STAGING_MARK_ANTHROPIC_API_KEY"):
            if name in values:
                raise ValueError("Hay configuración privada duplicada; revisa el archivo sin compartirlo.")
            values[name] = value
    model, key = values.get("STAGING_MARK_MODEL", ""), values.get("STAGING_MARK_ANTHROPIC_API_KEY", "")
    if not re.fullmatch(r"[a-zA-Z0-9._-]{1,120}", model) or not re.fullmatch(r"sk-ant-[a-zA-Z0-9_-]+", key):
        raise ValueError("Falta configurar modelo y clave privada de staging.")
    request = urllib.request.Request("https://api.anthropic.com/v1/models/" + model,
                                     headers={"x-api-key": key, "anthropic-version": "2023-06-01", "Accept": "application/json"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    with opener.open(request, timeout=10) as response:
        body = json.loads(response.read(65536))
    canonical = body.get("id")
    if canonical != model:
        print("El proveedor devolvió un identificador distinto:", str(canonical)[:120])
        raise ValueError("Revisa el modelo exacto y su tarifa antes de habilitar pruebas.")
    print("Modelo disponible:", model)
    print("Consulta de metadatos completada; no se solicitó generación de texto.")


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as error:
        print("No se confirmó el modelo. HTTP", error.code, "(sin mostrar credenciales ni respuesta del proveedor).")
        sys.exit(1)
    except ValueError as error:
        print(str(error))
        sys.exit(1)
    except Exception:
        print("No fue posible verificar el proveedor. No se generó texto ni se mostraron credenciales.")
        sys.exit(1)
