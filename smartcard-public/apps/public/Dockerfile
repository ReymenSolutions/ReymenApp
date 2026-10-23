# Fase 15 (preparar para producción) -- gemelo exacto de apps/admin/Dockerfile,
# mismo razonamiento completo ahí (contexto = raíz del monorepo, 3 etapas,
# @reymen/database y @reymen/lib bundleadas dentro de los chunks del
# servidor, sin carpeta propia en el resultado).

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
RUN npm run build --workspace=apps/public

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/apps/public/.next/standalone ./
COPY --from=builder /app/apps/public/.next/static ./apps/public/.next/static
COPY --from=builder /app/apps/public/public ./apps/public/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", "apps/public/server.js"]
