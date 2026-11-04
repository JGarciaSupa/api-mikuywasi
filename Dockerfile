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

# Salud del contenedor: GET /health responde 503 solo si no hay conexión con la BD master.
# start-period amplio: antes de levantar la API se aplican las migraciones y tareas de despliegue.
HEALTHCHECK --interval=30s --timeout=5s --start-period=600s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4001) + '/health').then((r) => process.exit(r.status < 500 ? 0 : 1)).catch(() => process.exit(1))"

# Usar el usuario bun por seguridad (usuario no raíz incluido en la imagen base)
USER bun

# Comando para iniciar la aplicación: migra los tenants y arranca la API (ver docker/start.sh)
CMD ["sh", "docker/start.sh"]