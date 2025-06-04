FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY services/relay-daemon ./services/relay-daemon
COPY solana-programs/election/target/idl ./solana-programs/election/target/idl
RUN npx tsc -p services/relay-daemon
CMD ["node","services/relay-daemon/dist/index.js"]
