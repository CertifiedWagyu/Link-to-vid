FROM node:22-slim

# Install ffmpeg and python/yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg python3 python3-pip ca-certificates \
  && pip3 install --break-system-packages --no-cache-dir yt-dlp \
  && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --production

ENV NODE_ENV=production
ENV PORT=10000
EXPOSE 10000

CMD ["sh", "-c", "pip3 install --break-system-packages --no-cache-dir -U yt-dlp 2>/dev/null; npm start"]