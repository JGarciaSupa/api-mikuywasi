# Usa la imagen oficial de Bun
FROM oven/bun:1

# Establecer directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package.json bun.lock* ./

# Instalar dependencias
RUN bun install --frozen-lockfile

# Copiar el resto del código (incluyendo src/)
COPY . .

# Exponer el puerto que configuraste en Dokploy
EXPOSE 6100

# Comando de inicio
CMD ["bun", "run", "src/index.ts"]