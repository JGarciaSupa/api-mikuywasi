# Usamos la imagen base de Bun recomendada para tu VPS
FROM oven/bun:1.1-slim

# Definimos el directorio de trabajo
WORKDIR /app

# Copiamos solo los archivos necesarios para instalar dependencias y aprovechar el caché
# Esto acelera los despliegues si las dependencias no han cambiado
COPY package.json bun.lock* ./

# Instalamos solo las dependencias de producción para mantener la imagen ligera
RUN bun install --production --no-cache

# Copiamos el resto del código del proyecto
# Asegúrate de tener un .dockerignore para no copiar node_modules locales
COPY . .

# Exponemos el puerto que configuramos arriba (4001)
EXPOSE 4001

# Usar el usuario bun por seguridad (usuario no raíz incluido en la imagen base)
USER bun

# Comando para iniciar la aplicación
CMD ["bun", "run", "src/index.ts"]