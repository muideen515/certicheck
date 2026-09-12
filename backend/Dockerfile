FROM node:18-alpine
WORKDIR /app

# Install production dependencies
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --only=production

# Copy source
COPY backend/ .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "src/server.js"]
