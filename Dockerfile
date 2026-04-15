# Usamos la imagen base de Bun directamente
FROM oven/bun:1.1-slim
WORKDIR /app

# 1. Copiamos los archivos de dependencias primero para aprovechar el caché de Docker
# Si no cambias el package.json, este paso se lo saltará en el próximo deploy
COPY package.json bun.lock* ./

# 2. Instalamos las dependencias directamente en la carpeta actual
# Quitamos el --frozen-lockfile para evitar errores de sincronización
RUN bun install --no-cache

# 3. Copiamos el resto del código del proyecto
COPY . .

# Exponemos el puerto de tu backend
EXPOSE 4001

# Comando para iniciar la aplicación
# Usamos la ruta directa para evitar intermediarios
CMD ["bun", "run", "src/index.ts"]