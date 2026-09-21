# ---- Build stage ----
FROM node:20-alpine AS build

WORKDIR /app

# Install deps (dev + prod) first — leverages Docker layer caching
COPY package*.json ./
RUN npm ci

# Copy TS source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from the build stage
COPY --from=build /app/dist ./dist

# Run as non-root
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 5000

CMD ["node", "dist/server.js"]