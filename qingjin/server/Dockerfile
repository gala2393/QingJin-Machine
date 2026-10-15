# Debian (glibc) base: sharp and Prisma ship prebuilt binaries for it without extra setup.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build && npm prune --omit=dev

# Astro showcase site source + its build toolchain; the publish pipeline builds releases from it.
# "site" is a named build context (see deploy/docker-compose.yml) pointing at qingjin-site/.
FROM node:24-bookworm-slim AS sitebuild
WORKDIR /site
COPY --from=site package.json package-lock.json ./
# Full install: @astrojs/sitemap is a devDependency but is needed at build time.
RUN npm ci
COPY --from=site astro.config.mjs tsconfig.json ./
COPY --from=site src ./src
COPY --from=site public ./public

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts /app/package.json ./
# Owned by node: Vite writes its cache into the site's node_modules during builds.
COPY --from=sitebuild --chown=node:node /site /site
# New named volumes copy these directories' ownership, so the non-root user can write to them.
RUN mkdir -p /data/uploads /data/publish /data/backups && chown node:node /data/uploads /data/publish /data/backups
USER node
EXPOSE 3000 4400
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
