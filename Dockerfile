# Use the official Bun image
FROM oven/bun:1 as base
WORKDIR /app

# Stage 1: Install dependencies
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Stage 2: Final image
FROM base AS release
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# Expose the port from src/index.ts (default 3000)
EXPOSE 3000

# Run the application
CMD ["bun", "run", "src/index.ts"]
