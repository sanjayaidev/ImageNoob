# Optional: only needed if you want to host this online (e.g. Railway).
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY . .
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", "server.js"]
