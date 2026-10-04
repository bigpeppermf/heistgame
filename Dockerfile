# Backend image for HeistCode.
#
# Two hard requirements drive this file:
#   1. Submitted code runs as REAL processes, so the image needs python3 as
#      well as node. A node-only image fails every Python submission at
#      runtime and looks like a broken game rather than a missing dependency.
#   2. `npm start` runs through tsx, because @heist/shared's package exports
#      point at TypeScript source. tsx supplies the .js -> .ts resolution that
#      plain node lacks. tsx is a devDependency, so dev deps must be installed.
FROM node:24-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Manifests first so the dependency layer caches independently of source.
# Every workspace manifest is required: npm ci resolves the whole workspace
# graph from the lockfile and fails if one is missing.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/

# The lockfile is written by npm 10, and the npm 11 that ships with node:24
# rejects it: it expects a fuller set of platform-specific optional packages
# (@esbuild/*, lightningcss-*, @rollup/rollup-*) and fails `npm ci` with
# EUSAGE "not in sync". Pinning npm to the version that produced the lock
# keeps the installed tree byte-identical to the one the test suite ran on,
# which `npm install` would not guarantee.
RUN npm install -g npm@10.9.2

# NODE_ENV is deliberately NOT set yet: with NODE_ENV=production, npm would
# omit devDependencies and strip out tsx, leaving the server unable to start.
RUN npm ci

# Only what the server needs at runtime; the web app is deployed on Vercel.
COPY packages/shared packages/shared
COPY apps/server apps/server

RUN chown -R node:node /app
USER node

ENV NODE_ENV=production
# Railway injects its own PORT and the server reads it; this is documentation.
EXPOSE 4000

CMD ["npm", "run", "-w", "@heist/server", "start"]
