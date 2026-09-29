FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .

# Dev: Vite with hot reload (used by docker-compose.dev.yml)
FROM base AS dev
EXPOSE 5173
CMD ["npm", "run", "dev"]

FROM base AS build
RUN npm run build

# Prod: static files served by nginx, /api proxied to the server
FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
