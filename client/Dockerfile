# ---- Build the SPA ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_API_URL=
ARG VITE_GOOGLE_CLIENT_ID=
ARG VITE_STRIPE_PUBLISHABLE_KEY=
RUN npm run build

# ---- Serve with nginx (gzip, long-lived caching for hashed assets, SPA fallback, /api proxy) ----
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
