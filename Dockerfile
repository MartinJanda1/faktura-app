FROM node:20-alpine AS build

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build:css

FROM node:20-alpine

WORKDIR /app

COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci --omit=dev

COPY web/ ./web/
COPY --from=build /app/web/css ./web/css

COPY pg-scripts/package.json pg-scripts/package-lock.json ./pg-scripts/
RUN cd pg-scripts && npm ci --omit=dev

COPY pg-scripts/ ./pg-scripts/
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /app/web
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
