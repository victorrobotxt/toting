# services/relay-daemon/Dockerfile
FROM node:20-alpine

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and lockfile
COPY services/relay-daemon/package*.json ./

# Install dependencies. This creates a `node_modules` directory in `/app`
RUN npm install

# Copy the rest of the source code for the relay daemon.
COPY services/relay-daemon/ ./

# Copy the Solana IDL needed for the build.
# This assumes the Docker build context is the monorepo root.
COPY solana-programs/election/target/idl/election_mirror.json ./idl/election_mirror.json

# Compile TypeScript to JavaScript.
# The tsconfig.json in this directory will be used.
RUN npx tsc

# The CMD should execute the compiled JS file from the `dist` directory.
CMD ["node", "dist/index.js"]
