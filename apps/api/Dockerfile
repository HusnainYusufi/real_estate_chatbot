# Build from the REPO ROOT context: docker build -f apps/api/Dockerfile .
FROM node:22-alpine

WORKDIR /app
COPY apps/api/package*.json ./
RUN npm install

COPY apps/api/tsconfig.json apps/api/nest-cli.json ./
COPY apps/api/src ./src
COPY apps/api/public ./public
RUN npm run build

# Seed data baked in so `docker compose exec api node dist/seed.js` works.
COPY seed-data ./seed-data

EXPOSE 4000
CMD ["node", "dist/main.js"]
