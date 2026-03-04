FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Build must never depend on production secrets or external services.
ENV DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public" \
    DIRECT_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public" \
    JWT_SECRET="build-only-jwt-secret" \
    APP_URL="http://localhost:3000" \
    INTERNAL_APP_URL="http://localhost:3000" \
    APP_TIMEZONE="America/Sao_Paulo" \
    S3_ENDPOINT_INTERNAL="http://127.0.0.1:9000" \
    S3_PUBLIC_ENDPOINT="http://127.0.0.1:9000" \
    S3_ENDPOINT="http://127.0.0.1:9000" \
    S3_REGION="us-east-1" \
    S3_ACCESS_KEY="build-access-key" \
    S3_SECRET_KEY="build-secret-key" \
    S3_BUCKET="build-bucket" \
    S3_PUBLIC_BASE_URL="https://example.com/build-bucket" \
    S3_FORCE_PATH_STYLE="true" \
    NEXT_PUBLIC_APP_NAME="Ranking TCC" \
    SMTP_HOST="localhost" \
    SMTP_PORT="1025" \
    SMTP_USER="build" \
    SMTP_PASS="build" \
    SMTP_FROM="no-reply@example.com"

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run prisma:generate
RUN NEXT_PRIVATE_BUILD_WORKER=1 NEXT_TELEMETRY_DISABLED=1 npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache curl libc6-compat
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
