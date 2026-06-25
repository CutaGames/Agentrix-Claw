# ===========================================
# Agentrix Backend - Production Dockerfile
# ===========================================
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++ bash git

# Copy package files
COPY package.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies and tools for migration
RUN apk add --no-cache dumb-init bash

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001

# Install all dependencies to support migrations in production environment
COPY package.json ./
RUN npm install --legacy-peer-deps

# Copy built application from builder stage
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./

# Create uploads and knowledge directories
RUN mkdir -p uploads knowledge && chown nestjs:nodejs uploads knowledge

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3001

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/main.js"]
