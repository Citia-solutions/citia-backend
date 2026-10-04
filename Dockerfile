# syntax=docker/dockerfile:1

###############################################################################
# Stage 1: deps - instala TODAS las dependencias (incluye dev para compilar)
###############################################################################
FROM node:22-alpine AS deps
WORKDIR /app

# Copia solo los manifiestos para aprovechar la cache de capas de Docker:
# si package*.json no cambia, no se reinstala en builds posteriores.
COPY package*.json ./
RUN npm ci

###############################################################################
# Stage 2: builder - compila TypeScript -> dist/
###############################################################################
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Genera dist/ (incluye dist/database/data-source.js y dist/database/migrations/*.js)
RUN npm run build

# Recorta node_modules a solo dependencias de produccion.
# typeorm queda incluido (es dependency, no devDependency) -> el CLI esta disponible en prod.
RUN npm prune --omit=dev

###############################################################################
# Stage 3: runner - imagen final liviana de produccion
###############################################################################
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# tini para manejo correcto de senales (PID 1) y reaping de procesos hijos.
RUN apk add --no-cache tini

# Copia artefactos minimos: deps de prod, build y manifiestos (para npm scripts).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Ejecuta como usuario no-root (la imagen node trae el usuario 'node').
USER node

EXPOSE 3000

# tini -> entrypoint (migraciones) -> arranque de la app
ENTRYPOINT ["/sbin/tini", "--", "./entrypoint.sh"]
CMD ["node", "dist/main"]
