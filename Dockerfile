FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

ARG DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public
ARG DIRECT_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres?schema=public
ARG JWT_SECRET=build-only-jwt-secret
ARG APP_URL=http://localhost:3000
ARG INTERNAL_APP_URL=http://localhost:3000
ARG APP_TIMEZONE=America/Sao_Paulo
ARG S3_ENDPOINT_INTERNAL=http://127.0.0.1:9000
ARG S3_PUBLIC_ENDPOINT=http://127.0.0.1:9000
ARG S3_ENDPOINT=http://127.0.0.1:9000
ARG S3_REGION=us-east-1
ARG S3_ACCESS_KEY=build-access-key
ARG S3_SECRET_KEY=build-secret-key
ARG S3_BUCKET=build-bucket
ARG S3_PUBLIC_BASE_URL=https://example.com/build-bucket
ARG S3_FORCE_PATH_STYLE=true
ARG NEXT_PUBLIC_APP_NAME="Ranking TCC"
ARG SMTP_HOST=localhost
ARG SMTP_PORT=1025
ARG SMTP_USER=build
ARG SMTP_PASS=build
ARG SMTP_FROM=no-reply@example.com

ENV DATABASE_URL=$DATABASE_URL
ENV DIRECT_URL=$DIRECT_URL
ENV JWT_SECRET=$JWT_SECRET
ENV APP_URL=$APP_URL
ENV INTERNAL_APP_URL=$INTERNAL_APP_URL
ENV APP_TIMEZONE=$APP_TIMEZONE
ENV S3_ENDPOINT_INTERNAL=$S3_ENDPOINT_INTERNAL
ENV S3_PUBLIC_ENDPOINT=$S3_PUBLIC_ENDPOINT
ENV S3_ENDPOINT=$S3_ENDPOINT
ENV S3_REGION=$S3_REGION
ENV S3_ACCESS_KEY=$S3_ACCESS_KEY
ENV S3_SECRET_KEY=$S3_SECRET_KEY
ENV S3_BUCKET=$S3_BUCKET
ENV S3_PUBLIC_BASE_URL=$S3_PUBLIC_BASE_URL
ENV S3_FORCE_PATH_STYLE=$S3_FORCE_PATH_STYLE
ENV NEXT_PUBLIC_APP_NAME="${NEXT_PUBLIC_APP_NAME}"
ENV SMTP_HOST=$SMTP_HOST
ENV SMTP_PORT=$SMTP_PORT
ENV SMTP_USER=$SMTP_USER
ENV SMTP_PASS=$SMTP_PASS
ENV SMTP_FROM=$SMTP_FROM

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
