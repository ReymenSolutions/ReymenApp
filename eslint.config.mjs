import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  // La tarjeta pública (otra app, con su propio package.json) no se valida con esta configuración.
  { ignores: ["smartcard-public/**", "sites/taller-wolf/v8/assets/vendor/**"] },
  ...coreWebVitals,
  ...nextTypescript,
  {
    files: ["sites/taller-wolf/herramientas/paginas-v8.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    rules: {
      // New in eslint-config-next 16 (react-compiler-era hook safety checks).
      // Flags several existing, intentional patterns (resetting state on
      // selection change, hard-navigating via window.location after
      // impersonation) that predate this rule — downgraded rather than
      // rewritten mid dependency-bump; revisit as a dedicated cleanup.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
    },
  },
];

export default eslintConfig;
