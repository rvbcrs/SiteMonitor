ARG NODE_VERSION=18-bullseye

# Build stage for frontend
FROM node:${NODE_VERSION}-slim as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ENV REACT_APP_API_URL=""
ENV REACT_APP_WS_URL=""
RUN npm run build

# Build stage for backend
FROM node:${NODE_VERSION}-slim as backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/ ./src/

# Final stage - Use the slim variant
FROM node:${NODE_VERSION}-slim
WORKDIR /app

# Install Chrome dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-symbola \
    fonts-noto \
    fonts-freefont-ttf \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Copy only necessary files from build stages
COPY --from=frontend-builder /app/frontend/build ./frontend/build
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/src ./src
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Expose port
EXPOSE 3000 3001 3002

# Default command (can be overridden in docker-compose)
CMD ["node", "src/index.js"]