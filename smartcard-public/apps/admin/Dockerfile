# Fase 15 (preparar para producción).
#
# El contexto de build es la RAÍZ del monorepo, no apps/admin/ -- por eso se
# construye con `docker build -f apps/admin/Dockerfile .` desde la raíz (o,
# más cómodo, con infra/docker-compose.yml, que ya apunta el `context` bien).
# Hace falta ver todo el monorepo porque apps/admin depende de
# @reymen/database y @reymen/lib (packages/), que son workspaces del mismo
# repo, no paquetes de npm publicados -- sin verlos, `npm ci` no puede
# resolver nada.
#
# Tres etapas: "deps" instala TODO el árbol de dependencias una sola vez;
# "builder" compila solo apps/admin (next build, con `output: 'standalone'`
# en next.config.js -- ver el comentario ahí); "runner" es la imagen final,
# y solo lleva lo que `next start` en modo standalone realmente necesita en
# runtime -- nada de código fuente, nada del node_modules completo del
# monorepo. @reymen/database y @reymen/lib NO aparecen como carpetas propias
# en el resultado -- Next.js las compila (bundlea) directo dentro de los
# chunks del servidor, igual que cualquier otro archivo de la app, porque
# son workspaces sin paso de build propio (exports apuntan directo a .ts).

FROM node:22-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/admin/package.json ./apps/admin/package.json
COPY apps/public/package.json ./apps/public/package.json
COPY apps/ops/package.json ./apps/ops/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/lib/package.json ./packages/lib/package.json
COPY packages/entitlements/package.json ./packages/entitlements/package.json
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json /app/package-lock.json ./
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=apps/admin

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# .next/static NO viene incluido en la salida "standalone" -- Next.js asume
# que normalmente se sirve aparte (CDN). Aquí se copia a mano al mismo lugar
# donde el server standalone lo espera.
COPY --from=builder /app/apps/admin/.next/standalone ./
COPY --from=builder /app/apps/admin/.next/static ./apps/admin/.next/static
COPY --from=builder /app/apps/admin/public ./apps/admin/public

USER nextjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/admin/server.js"]
