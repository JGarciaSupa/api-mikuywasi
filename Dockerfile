# Usamos la imagen base de Bun recomendada para tu VPS
FROM oven/bun:1.2-slim

# Definimos el directorio de trabajo
WORKDIR /app

# Copiamos solo el package.json para la instalación inicial
# Omitimos bun.lock para evitar errores de "Unknown lockfile version" y dejar que Bun genere uno nuevo
COPY package.json ./

# Instalamos solo las dependencias de producción para mantener la imagen ligera
RUN bun install --production --no-cache

# Copiamos el resto del código del proyecto
COPY . .

# Puerto configurable desde el ENV (PORT); 4001 si no se define
ENV PORT=4001
EXPOSE ${PORT}

# Usar el usuario bun por seguridad (usuario no raíz incluido en la imagen base)
USER bun

# Comando para iniciar la aplicación
CMD ["bun", "run", "src/index.ts"]