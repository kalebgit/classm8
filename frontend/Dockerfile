# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# El apiUrl de producción sale de src/environments/environment.ts
RUN npm run build

# ---- runtime ----
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Solo lo necesario para ejecutar el server SSR ya compilado.
COPY --from=build /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/frontend/server/server.mjs"]
