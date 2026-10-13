import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

// Next.js dev mode bundles modules with eval()-based source maps for fast
// refresh, which needs 'unsafe-eval' — production builds don't use eval and
// don't get it. Only script-src's *inline* allowance is a real, permanent
// tradeoff (see below); the eval allowance never ships to production.
const SCRIPT_SRC = process.env.NODE_ENV === "production"
  ? "script-src 'self' 'unsafe-inline'"
  : "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

// Teselas del mapa de Lealtad (Leaflet). Por omisión OpenStreetMap; con
// NEXT_PUBLIC_MAP_TILE_URL se puede usar otro proveedor y su host entra aquí.
function tileOrigin(): string {
  const url = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  try {
    const host = new URL(url.replace(/\{s\}\./, "a.").replace(/\{[a-z]\}/g, "0")).host;
    const wildcard = url.includes("{s}.") ? `*.${host.split(".").slice(1).join(".")}` : host;
    return `https://${wildcard}`;
  } catch {
    return "https://tile.openstreetmap.org";
  }
}

const CSP = [
  "default-src 'self'",
  // Next.js injects its hydration/RSC payload as inline <script> tags with no
  // nonce support wired up here, so 'unsafe-inline' is required for the app
  // to render at all — but script-src still blocks loading any *external*
  // script, which is what actually matters against XSS/supply-chain risk.
  SCRIPT_SRC,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: https://api.dicebear.com ${tileOrigin()}`,
  "font-src 'self' data:",
  // Same-origin API calls, plus Sentry's error/trace ingestion when SENTRY_DSN
  // is configured (no-op otherwise — CSP only restricts requests actually made).
  "connect-src 'self' https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.us.sentry.io",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Requerido por docker/Dockerfile: ese build copia .next/standalone (ver
  // COPY --from=builder .../standalone en la etapa runner) para no llevar
  // node_modules completo a la imagen final. Sin esta línea, next build
  // nunca genera esa carpeta y el build de Docker falla en el COPY con
  // "not found" -- descubierto ahora porque es la primera vez que este
  // Dockerfile se corre de verdad (documentado pero nunca antes probado).
  output: "standalone",
  poweredByHeader: false,
  images: {
    // A wildcard hostname here would let next/image's server-side optimizer
    // fetch attacker-chosen HTTPS URLs (SSRF/internal port scanning/DoS) the
    // moment any user-controlled URL (e.g. organization.logoUrl) is ever
    // passed to <Image>. Only the avatar preset provider actually needs to
    // be reachable this way — everything else renders via plain <img>.
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
    ],
  },
  async headers() {
    return [{ source: "/(.*)", headers: SECURITY_HEADERS }];
  },
};

// withSentryConfig only uploads source maps / wraps build output when SENTRY_DSN
// (or SENTRY_AUTH_TOKEN, for upload auth) is configured; otherwise it's a no-op passthrough.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  widenClientFileUpload: false,
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN },
  telemetry: false,
  webpack: { treeshake: { removeDebugLogging: true } },
});
