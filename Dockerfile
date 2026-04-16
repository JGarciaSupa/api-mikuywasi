# Usamos la imagen base de Bun recomendada para tu VPS
FROM oven/bun:1.1-slim

# Definimos el directorio de trabajo
WORKDIR /app

# Configuramos variables de entorno para producción y el puerto que usa tu VPS
# IMPORTANTE: Sin PORT=4001, la app escuchará en el 3000 por defecto y el VPS no conectará
ENV NODE_ENV=production
ENV PORT=4001

# Copiamos solo el package.json para la instalación inicial
# Omitimos bun.lock para evitar errores de "Unknown lockfile version" y dejar que Bun genere uno nuevo
COPY package.json ./

# Instalamos solo las dependencias de producción para mantener la imagen ligera
RUN bun install --production --no-cache

# Copiamos el resto del código del proyecto
COPY . .

# Exponemos el puerto que configuramos arriba (4001)
EXPOSE 4001

# Usar el usuario bun por seguridad (usuario no raíz incluido en la imagen base)
USER bun

# Comando para iniciar la aplicación
CMD ["bun", "run", "src/index.ts"]