# DOGFOOD 2026 Platform - Production Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
RUN corepack pnpm install --frozen-lockfile || corepack pnpm install

COPY . .

# Build client React application
RUN corepack pnpm exec vite build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

RUN corepack enable

COPY package.json pnpm-lock.yaml* ./
RUN corepack pnpm install --prod --frozen-lockfile || corepack pnpm install --prod

# Copy built frontend, server source, schema, and fixtures
COPY --from=builder /app/dist ./dist
COPY src/ ./src/
COPY fixtures.json ./fixtures.json
COPY .dogfood.toml ./
COPY LICENSE ./

EXPOSE 8080

CMD ["node", "src/server/index.js"]
