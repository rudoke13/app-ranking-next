FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat

ARG DATABASE_URL
ARG DIRECT_URL
ARG JWT_SECRET
ARG APP_URL
ARG INTERNAL_APP_URL
ARG APP_TIMEZONE
ARG S3_ENDPOINT_INTERNAL
ARG S3_PUBLIC_ENDPOINT
ARG S3_ENDPOINT
ARG S3_REGION
ARG S3_ACCESS_KEY
ARG S3_SECRET_KEY
ARG S3_BUCKET
ARG S3_PUBLIC_BASE_URL
ARG S3_FORCE_PATH_STYLE
ARG NEXT_PUBLIC_APP_NAME
ARG SMTP_HOST
ARG SMTP_PORT
ARG SMTP_USER
ARG SMTP_PASS
ARG SMTP_FROM

ENV DATABASE_URL=${DATABASE_URL}
ENV DIRECT_URL=${DIRECT_URL}
ENV JWT_SECRET=${JWT_SECRET}
ENV APP_URL=${APP_URL}
ENV INTERNAL_APP_URL=${INTERNAL_APP_URL}
ENV APP_TIMEZONE=${APP_TIMEZONE}
ENV S3_ENDPOINT_INTERNAL=${S3_ENDPOINT_INTERNAL}
ENV S3_PUBLIC_ENDPOINT=${S3_PUBLIC_ENDPOINT}
ENV S3_ENDPOINT=${S3_ENDPOINT}
ENV S3_REGION=${S3_REGION}
ENV S3_ACCESS_KEY=${S3_ACCESS_KEY}
ENV S3_SECRET_KEY=${S3_SECRET_KEY}
ENV S3_BUCKET=${S3_BUCKET}
ENV S3_PUBLIC_BASE_URL=${S3_PUBLIC_BASE_URL}
ENV S3_FORCE_PATH_STYLE=${S3_FORCE_PATH_STYLE}
ENV NEXT_PUBLIC_APP_NAME=${NEXT_PUBLIC_APP_NAME}
ENV SMTP_HOST=${SMTP_HOST}
ENV SMTP_PORT=${SMTP_PORT}
ENV SMTP_USER=${SMTP_USER}
ENV SMTP_PASS=${SMTP_PASS}
ENV SMTP_FROM=${SMTP_FROM}

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN set -eux; \
    if [ -z "${DATABASE_URL:-}" ] && [ -z "${DIRECT_URL:-}" ]; then \
      echo "DATABASE_URL/DIRECT_URL ausentes no build"; \
      exit 1; \
    fi; \
    if [ -z "${DATABASE_URL:-}" ]; then \
      export DATABASE_URL="${DIRECT_URL}"; \
    fi; \
    if [ -z "${DIRECT_URL:-}" ]; then \
      export DIRECT_URL="${DATABASE_URL}"; \
    fi; \
    npm run prisma:generate
RUN set -eux; \
    if [ -z "${DATABASE_URL:-}" ] && [ -z "${DIRECT_URL:-}" ]; then \
      echo "DATABASE_URL/DIRECT_URL ausentes no build"; \
      exit 1; \
    fi; \
    if [ -z "${DATABASE_URL:-}" ]; then \
      export DATABASE_URL="${DIRECT_URL}"; \
    fi; \
    if [ -z "${DIRECT_URL:-}" ]; then \
      export DIRECT_URL="${DATABASE_URL}"; \
    fi; \
    npm run build

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
