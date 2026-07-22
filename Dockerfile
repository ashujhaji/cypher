FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
RUN mkdir -p /app/data /app/config && chown -R app:app /app
USER app
ENV NODE_ENV=production
VOLUME ["/app/data", "/app/config"]
CMD ["node", "src/index.js"]
