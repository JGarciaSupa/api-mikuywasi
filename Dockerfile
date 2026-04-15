# Usar imagen base oficial de Bun
FROM oven/bun:1-slim AS base
WORKDIR /app

# Instalar dependencias para aprovechar el cache
COPY package.json bun.lock* ./

# Instalar solo dependencias de producción para ahorrar espacio y RAM
# sharp se descargará sus binarios pre-compilados aquí
RUN bun install --frozen-lockfile --production

# Copiar el código fuente
COPY . .

# Variable de entorno para indicar producción
ENV NODE_ENV=production

# Exponer el puerto configurado (Dokploy usará este puerto internamente)
EXPOSE 6100

# Usar el usuario no-root por seguridad
USER bun

# Comando de inicio
CMD ["bun", "run", "src/index.ts"]