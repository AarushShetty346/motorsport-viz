# Stage 1: build the web app (React + Vite) into dist/
FROM node:22-alpine AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY vite.config.mjs ./
COPY web ./web
RUN npm run build

# Stage 2: the Express server, with only production dependencies
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY auth.js db.js server.js ./
COPY data ./data
COPY --from=web /app/dist ./dist
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.js"]
