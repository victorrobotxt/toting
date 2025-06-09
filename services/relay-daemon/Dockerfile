# services/relay-daemon/Dockerfile
FROM node:20-alpine
WORKDIR /app

# Copy the package.json and the lock file
COPY services/relay-daemon/package.json services/relay-daemon/package-lock.json ./

# --- FIX: Use 'npm install' which is more resilient than 'npm ci' ---
# It will use the lockfile if present, but won't fail if it's missing from the build context.
RUN npm install

# Copy the rest of the application code
COPY services/relay-daemon ./services/relay-daemon
COPY solana-programs/election/target/idl ./solana-programs/election/target/idl

# Compile the TypeScript code
RUN npx tsc -p services/relay-daemon

# Set the command to run the compiled JavaScript
CMD ["node","services/relay-daemon/dist/index.js"]