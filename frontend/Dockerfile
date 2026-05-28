# syntax=docker/dockerfile:1
# Runtime-only: build (pnpm build) eseguito FUORI sul host perché in questo
# ambiente Tailwind v3 non emette CSS dentro node:20-slim. Vedi scripts/build-prod.sh.
FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
COPY .next/standalone/ ./
COPY .next/static ./.next/static
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
