# ===========================================
# Agentrix Frontend - Production Dockerfile
# ===========================================
# Multi-stage build for optimized production image

# Stage 1: Dependencies
FROM node:20-alpine AS deps

WORKDIR /app
RUN apk add --no-cache eudev-dev python3 make g++ git bash linux-headers

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Stage 2: Build
FROM node:20-alpine AS builder

WORKDIR /app
RUN apk add --no-cache eudev-dev python3 make g++ git bash linux-headers

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_CHAIN_ID
ARG NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CHAIN_ID=$NEXT_PUBLIC_CHAIN_ID
ENV NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=$NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID

# Build the application
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS production

WORKDIR /app
RUN apk add --no-cache eudev-dev python3 make g++ git bash linux-headers

# Install production dependencies only
RUN apk add --no-cache eudev-dev dumb-init

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy built application
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "server.js"]
