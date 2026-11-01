# =============================================================================
# Klippers — single-service image: Express API + built React app on one origin.
# Used by render.yaml (and any host that runs one container: Railway, Fly.io…).
# The separate server/ and client/ Dockerfiles remain for the docker-compose setup.
# =============================================================================

# ---- 1. Build the SPA ----
FROM node:22-alpine AS web
WORKDIR /web
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
# Same origin as the API, so VITE_API_URL stays empty. Optional public keys:
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_STRIPE_PUBLISHABLE_KEY=
RUN npm run build

# ---- 2. API runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    STATIC_DIR=/app/public \
    PORT=4000
COPY server/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server/src ./src
COPY --from=web /web/dist ./public
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:${PORT}/api/health || exit 1
CMD ["node", "src/index.js"]
