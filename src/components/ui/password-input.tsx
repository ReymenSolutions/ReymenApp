"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/context/preferences";
import { Input, type InputProps } from "./input";

/**
 * Campo de contraseña con el ojo para verla u ocultarla. Es un `Input` normal (acepta `register(...)` de react-hook-form,
 * `value`/`onChange`, etc.); el botón no entra en el envío del formulario y avisa su estado a los lectores de pantalla.
 */
const PasswordInput = React.forwardRef<HTMLInputElement, Omit<InputProps, "type">>(({ className, ...props }, ref) => {
  const { lang } = usePreferences();
  const [visible, setVisible] = React.useState(false);
  const label = visible ? (lang === "es" ? "Ocultar contraseña" : "Hide password") : lang === "es" ? "Mostrar contraseña" : "Show password";
  return (
    <div className="relative">
      <Input ref={ref} type={visible ? "text" : "password"} className={cn("pr-10", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        disabled={props.disabled}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-50"
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </div>
  );
});
PasswordInput.displayName = "PasswordInput";

export { PasswordInput };
