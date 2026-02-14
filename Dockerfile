# Multi-stage build for production
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY lerna.json ./
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps

# Install dependencies
RUN npm ci
RUN npm run bootstrap

# Build all packages
RUN npm run build

# Remove dev dependencies
RUN npm prune --production

# Production stage
FROM node:18-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Copy built artifacts
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/packages ./packages
COPY --from=builder --chown=nodejs:nodejs /app/apps ./apps
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=builder --chown=nodejs:nodejs /app/lerna.json ./

# Create necessary directories
RUN mkdir -p /app/logs /app/extensions /app/backups
RUN chown -R nodejs:nodejs /app/logs /app/extensions /app/backups

USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node /app/apps/runtime/dist/health-check.js || exit 1

CMD ["node", "apps/runtime/dist/server.js"]