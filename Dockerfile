FROM node:24-trixie-slim AS deps
WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN yarn build

FROM node:24-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production --ignore-scripts && yarn cache clean
COPY --from=build /app/build ./build
COPY src/migrations ./src/migrations
COPY drizzle.config.ts ./
COPY .env.production ./

# `.env.production` đã mã hoá bằng dotenvx — lúc chạy container phải truyền private key:
#   docker run -e DOTENV_PRIVATE_KEY_PRODUCTION=<key> ...
# (key lấy trên máy đã encrypt: `npx dotenvx keypair DOTENV_PRIVATE_KEY_PRODUCTION -f .env.production`)
EXPOSE 2567

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "fetch('http://localhost:'+(process.env.PORT||2567)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["sh", "-c", "node_modules/.bin/dotenvx run -f .env.production -- node_modules/.bin/drizzle-kit migrate && node_modules/.bin/dotenvx run -f .env.production -- node build/seeds/index.js && exec node_modules/.bin/dotenvx run -f .env.production -- node build/index.js"]
