ARG NODE_VERSION=18-bullseye
ARG REACT_APP_API_URL_ARG=http://monitor.ramonvanbruggen.nl # Default fallback

# Build stage for frontend
FROM node:${NODE_VERSION} as frontend-builder
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
ARG REACT_APP_API_URL_ARG # Receive the build argument
ENV REACT_APP_API_URL=$REACT_APP_API_URL_ARG
RUN npm run build

# Build stage for backend
FROM node:${NODE_VERSION} as backend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY src/ ./src/

# Final stage
FROM node:${NODE_VERSION}
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