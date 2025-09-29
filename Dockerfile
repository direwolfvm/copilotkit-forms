# syntax=docker/dockerfile:1

# Build stage: install dependencies and compile the Vite app
FROM node:20-alpine AS build
WORKDIR /usr/src/app

# Install dependencies and build the app
COPY app/package*.json ./
RUN npm ci

COPY app/ ./
RUN npm run build

# Production image: serve the built assets with Vite preview
FROM node:20-alpine AS runner
WORKDIR /usr/src/app
ENV NODE_ENV=production

COPY --from=build /usr/src/app ./

EXPOSE 4173
ENV PORT=4173
CMD ["node", "startPreview.mjs"]
