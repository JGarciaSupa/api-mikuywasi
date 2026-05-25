-- =============================================================================
-- GastroPro 360 — Sistema de Almacenes e Inventarios
-- Ingeniería Inversa · PostgreSQL
-- Empresa: Estrategia Gastronómica A & G S.A.C.
-- =============================================================================

-- Extensiones
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Esquema principal
CREATE SCHEMA IF NOT EXISTS almacen;
SET search_path TO almacen, public;

-- =============================================================================
-- 1. FAMILIAS
-- Clasificación de primer nivel para artículos (ej: Alimentos, Licores, Químicos)
-- =============================================================================
CREATE TABLE familias (
    id_familia      SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL UNIQUE,
    descripcion     VARCHAR(255),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE familias IS 'Clasificación de primer nivel para artículos del inventario (ej: Alimentos, Licores, Químicos).';

-- =============================================================================
-- 2. SUBFAMILIAS
-- Clasificación de segundo nivel (ej: Carnes y Pescados, Frutas, Abarrotes)
-- =============================================================================
CREATE TABLE subfamilias (
    id_subfamilia   SERIAL PRIMARY KEY,
    id_familia      INT NOT NULL REFERENCES familias(id_familia),
    nombre          VARCHAR(100) NOT NULL,
    descripcion     VARCHAR(255),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (id_familia, nombre)
);

COMMENT ON TABLE subfamilias IS 'Clasificación de segundo nivel dentro de una familia (ej: Carnes y Pescados, Frutas).';

-- =============================================================================
-- 3. AREAS (Almacenes y Subalmacenes)
-- Representa el almacén central y todos los subalmacenes operativos.
-- es_central = TRUE identifica el almacén madre que abastece a los demás.
-- tipo: 'temperatura_ambiente' | 'frio' | 'congelado'
-- =============================================================================
CREATE TABLE areas (
    id_area         SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL UNIQUE,
    tipo            VARCHAR(50)  NOT NULL DEFAULT 'temperatura_ambiente'
                    CHECK (tipo IN ('temperatura_ambiente','frio','congelado','subalmacen')),
    es_central      BOOLEAN NOT NULL DEFAULT FALSE,
    descripcion     VARCHAR(255),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE areas IS 'Almacén central y subalmacenes operativos (cocina, bar, pastelería, etc.). es_central identifica el almacén madre.';

-- =============================================================================
-- 4. PROVEEDORES
-- Personas o empresas que abastecen los insumos al restaurante.
-- =============================================================================
CREATE TABLE proveedores (
    id_proveedor    SERIAL PRIMARY KEY,
    ruc             VARCHAR(20)  UNIQUE,
    razon_social    VARCHAR(200) NOT NULL,
    razon_comercial VARCHAR(200),
    contacto        VARCHAR(100),
    telefono        VARCHAR(30)  NOT NULL DEFAULT '-',
    email           VARCHAR(150) NOT NULL DEFAULT '-',
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modificado_en   TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE proveedores IS 'Personas o empresas que abastecen insumos. telefono y email admiten guion (-) cuando el dato no está disponible.';

-- =============================================================================
-- 5. ARTICULOS (Maestro de Artículos y Precios)
-- Catálogo maestro de todos los insumos y productos del sistema.
-- factor_equivalencia: relación entre unidad_kardex y unidad_costos (ej: 1 kg = 1000 g → 1000).
-- precio_promedio: se actualiza automáticamente con cada ingreso de documento (método PP).
-- =============================================================================
CREATE TABLE articulos (
    id_articulo             SERIAL PRIMARY KEY,
    codigo                  VARCHAR(20)  NOT NULL UNIQUE,
    descripcion_detallada   VARCHAR(200) NOT NULL,
    descripcion_resumida    VARCHAR(100) NOT NULL,
    id_subfamilia           INT          NOT NULL REFERENCES subfamilias(id_subfamilia),
    tipo_articulo           VARCHAR(50)  NOT NULL DEFAULT 'Mercaderia'
                            CHECK (tipo_articulo IN ('Mercaderia','Servicio','Activo Fijo')),
    unidad_kardex           VARCHAR(30)  NOT NULL,   -- ej: KILOS, LITROS, UNIDAD
    unidad_costos           VARCHAR(30)  NOT NULL,   -- ej: GRAMOS, ML
    factor_equivalencia     NUMERIC(12,4) NOT NULL DEFAULT 1,
    stock_minimo            NUMERIC(12,3) NOT NULL DEFAULT 0,
    stock_maximo            NUMERIC(12,3) NOT NULL DEFAULT 0,
    stock_ideal             NUMERIC(12,3) NOT NULL DEFAULT 0,
    stock_actual            NUMERIC(12,3) NOT NULL DEFAULT 0,  -- refleja almacén central
    dias_vencimiento        INT          NOT NULL DEFAULT 0,
    precio_mercado          NUMERIC(12,4) NOT NULL DEFAULT 0,
    precio_promedio         NUMERIC(12,4) NOT NULL DEFAULT 0,  -- se actualiza con cada ingreso
    precio_transferencia    NUMERIC(12,4) NOT NULL DEFAULT 0,
    valor_costos            NUMERIC(12,4) NOT NULL DEFAULT 0,
    activo                  BOOLEAN NOT NULL DEFAULT TRUE,
    control_diario          BOOLEAN NOT NULL DEFAULT TRUE,
    porcionable             BOOLEAN NOT NULL DEFAULT FALSE,
    valorizar_por_precio_mercado BOOLEAN NOT NULL DEFAULT FALSE,
    descarga_por_receta     BOOLEAN NOT NULL DEFAULT FALSE,
    criterio_impresion      VARCHAR(100),
    codigo_externo          VARCHAR(50),
    codigo_tributario       VARCHAR(30),
    creado_en               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modificado_en           TIMESTAMP WITH TIME ZONE,
    modificado_por          VARCHAR(100)
);

COMMENT ON TABLE articulos IS 'Catálogo maestro de insumos y productos. precio_promedio se recalcula con método PP en cada ingreso. porcionable=TRUE permite el módulo de porcionamiento.';

-- =============================================================================
-- 6. ARTICULOS_AREAS (Tabla Pivote: Artículo ↔ Subalmacén)
-- Define en qué áreas puede ser solicitado cada artículo (requerimientos).
-- Un artículo sin área asignada NO puede ser pedido por subalmacenes.
-- =============================================================================
CREATE TABLE articulos_areas (
    id              SERIAL PRIMARY KEY,
    id_articulo     INT NOT NULL REFERENCES articulos(id_articulo) ON DELETE CASCADE,
    id_area         INT NOT NULL REFERENCES areas(id_area),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (id_articulo, id_area)
);

COMMENT ON TABLE articulos_areas IS 'PIVOTE: mapea qué artículos pueden ser solicitados desde cada subalmacén. Sin esta asignación, el artículo no aparece en los requerimientos del área.';

-- =============================================================================
-- 7. DOCUMENTOS (Ingreso de Facturas / Boletas / Guías de Remisión)
-- Registra los comprobantes de proveedores que incrementan el stock.
-- estado: 'GENERADO' → puede modificarse; 'PROCESADO' → stock ya actualizado.
-- =============================================================================
CREATE TABLE documentos (
    id_documento        SERIAL PRIMARY KEY,
    tipo_documento      VARCHAR(30)  NOT NULL
                        CHECK (tipo_documento IN ('Factura','Boleta','Guia de Remision')),
    serie               VARCHAR(10)  NOT NULL,
    correlativo         VARCHAR(20)  NOT NULL,
    id_proveedor        INT          NOT NULL REFERENCES proveedores(id_proveedor),
    fecha_emision       DATE         NOT NULL,
    fecha_ingreso       DATE         NOT NULL DEFAULT CURRENT_DATE,
    fecha_pago          DATE,
    id_area             INT          NOT NULL REFERENCES areas(id_area),  -- almacén destino
    tipo_ingreso        VARCHAR(30)  NOT NULL DEFAULT 'Mercaderia'
                        CHECK (tipo_ingreso IN ('Mercaderia','Servicio','Activo Fijo')),
    operacion           VARCHAR(20)  NOT NULL DEFAULT 'GRAVADA'
                        CHECK (operacion IN ('GRAVADA','EXONERADA','INAFECTA')),
    moneda              VARCHAR(10)  NOT NULL DEFAULT 'Nuevos Soles',
    tipo_cambio         NUMERIC(8,4) NOT NULL DEFAULT 1,
    glosa               VARCHAR(200),
    referencia          VARCHAR(100),
    subtotal            NUMERIC(12,2) NOT NULL DEFAULT 0,
    igv                 NUMERIC(12,2) NOT NULL DEFAULT 0,
    total               NUMERIC(12,2) NOT NULL DEFAULT 0,
    redondeo            NUMERIC(8,4)  NOT NULL DEFAULT 0,
    descuento_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
    estado              VARCHAR(20)  NOT NULL DEFAULT 'GENERADO'
                        CHECK (estado IN ('GENERADO','PROCESADO','ANULADO')),
    numero_interno      VARCHAR(30),  -- ej: 202506-0001 (autogenerado al procesar)
    usuario             VARCHAR(100),
    creado_en           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    procesado_en        TIMESTAMP WITH TIME ZONE,
    UNIQUE (serie, correlativo, id_proveedor)
);

COMMENT ON TABLE documentos IS 'Comprobantes de proveedores que ingresan stock. estado GENERADO permite edición; PROCESADO actualiza kardex y precio_promedio del artículo.';

-- =============================================================================
-- 8. DOCUMENTO_DETALLE
-- Líneas de artículos dentro de cada comprobante.
-- =============================================================================
CREATE TABLE documento_detalle (
    id_detalle          SERIAL PRIMARY KEY,
    id_documento        INT  NOT NULL REFERENCES documentos(id_documento) ON DELETE CASCADE,
    id_articulo         INT  NOT NULL REFERENCES articulos(id_articulo),
    cantidad            NUMERIC(12,3) NOT NULL,
    precio_unitario     NUMERIC(12,4) NOT NULL,
    precio_total        NUMERIC(12,2) NOT NULL,
    igv_porcentaje      NUMERIC(5,2)  NOT NULL DEFAULT 18,
    igv_monto           NUMERIC(12,2) NOT NULL DEFAULT 0,
    descuento           NUMERIC(12,2) NOT NULL DEFAULT 0,
    otros_cargos        NUMERIC(12,2) NOT NULL DEFAULT 0,
    observacion         VARCHAR(200)
);

COMMENT ON TABLE documento_detalle IS 'Líneas de artículos de cada documento de compra. igv_porcentaje puede ser 18 o 10 según el artículo.';

-- =============================================================================
-- 9. REQUERIMIENTOS
-- Solicitudes de stock desde subalmacenes al almacén central.
-- Un requerimiento puede generarse manualmente o de forma automática
-- cuando un documento ingresa directo a un subalmacén.
-- =============================================================================
CREATE TABLE requerimientos (
    id_requerimiento    SERIAL PRIMARY KEY,
    fecha               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    fecha_atencion      TIMESTAMP WITH TIME ZONE,
    id_area             INT  NOT NULL REFERENCES areas(id_area),  -- subalmacén solicitante
    encargado_area      VARCHAR(100),
    referencia          VARCHAR(100),  -- si fue generado por documento, referencia al doc
    estado              VARCHAR(20) NOT NULL DEFAULT 'GENERADO'
                        CHECK (estado IN ('GENERADO','PROCESADO','ANULADO')),
    usuario             VARCHAR(100),
    creado_en           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    procesado_en        TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE requerimientos IS 'Solicitudes de stock desde subalmacenes al almacén central. Pueden ser manuales o auto-generadas por ingreso directo de documentos.';

-- =============================================================================
-- 10. REQUERIMIENTO_DETALLE
-- Líneas de artículos de cada requerimiento, con cantidad pedida vs atendida.
-- =============================================================================
CREATE TABLE requerimiento_detalle (
    id_detalle          SERIAL PRIMARY KEY,
    id_requerimiento    INT  NOT NULL REFERENCES requerimientos(id_requerimiento) ON DELETE CASCADE,
    id_articulo         INT  NOT NULL REFERENCES articulos(id_articulo),
    cantidad_pedida     NUMERIC(12,3) NOT NULL DEFAULT 0,
    cantidad_atendida   NUMERIC(12,3) NOT NULL DEFAULT 0,
    cantidad_pendiente  NUMERIC(12,3) GENERATED ALWAYS AS (cantidad_pedida - cantidad_atendida) STORED,
    stock_referencial   NUMERIC(12,3) NOT NULL DEFAULT 0,  -- stock en central al momento del pedido
    unidad_kardex       VARCHAR(30),
    unidad_costos       VARCHAR(30)
);

COMMENT ON TABLE requerimiento_detalle IS 'Líneas de artículos de cada requerimiento. cantidad_pendiente es columna generada (pedida - atendida).';

-- =============================================================================
-- 11. TRANSFERENCIAS
-- Movimientos de stock entre subalmacenes, o devolución al almacén central.
-- Puede originarse desde el módulo de transferencias o desde un requerimiento.
-- =============================================================================
CREATE TABLE transferencias (
    id_transferencia        SERIAL PRIMARY KEY,
    fecha                   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    id_area_origen          INT  NOT NULL REFERENCES areas(id_area),
    id_area_destino         INT  NOT NULL REFERENCES areas(id_area),
    id_requerimiento_origen INT  REFERENCES requerimientos(id_requerimiento),
    referencia              VARCHAR(100),
    estado                  VARCHAR(20) NOT NULL DEFAULT 'GENERADO'
                            CHECK (estado IN ('GENERADO','PROCESADO','ANULADO')),
    usuario                 VARCHAR(100),
    creado_en               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    procesado_en            TIMESTAMP WITH TIME ZONE,
    CHECK (id_area_origen <> id_area_destino)
);

COMMENT ON TABLE transferencias IS 'Traslado de stock entre subalmacenes o devolución al central. id_requerimiento_origen vincula la transferencia generada desde un requerimiento.';

-- =============================================================================
-- 12. TRANSFERENCIA_DETALLE
-- =============================================================================
CREATE TABLE transferencia_detalle (
    id_detalle          SERIAL PRIMARY KEY,
    id_transferencia    INT  NOT NULL REFERENCES transferencias(id_transferencia) ON DELETE CASCADE,
    id_articulo         INT  NOT NULL REFERENCES articulos(id_articulo),
    cantidad_kardex     NUMERIC(12,3) NOT NULL,
    cantidad_costos     NUMERIC(12,3),
    unidad_kardex       VARCHAR(30),
    unidad_costos       VARCHAR(30)
);

-- =============================================================================
-- 13. SALIDAS (Bajas de Stock)
-- Registra pérdidas operativas: mermas, descomposición, roturas, consumo personal.
-- concepto: tipo de salida (Bajas, Consumo, Control de calidad, etc.)
-- =============================================================================
CREATE TABLE salidas (
    id_salida       SERIAL PRIMARY KEY,
    id_area         INT  NOT NULL REFERENCES areas(id_area),
    tipo_salida     VARCHAR(30)  NOT NULL DEFAULT 'Consumo'
                    CHECK (tipo_salida IN ('Consumo','Bajas','Control de calidad',
                           'Prueba de Cocina','Transferencias por Factu',
                           'Limpieza Frutas','Gasto','Devolucion Cliente')),
    concepto        VARCHAR(100),  -- descripción libre del motivo
    motivo          VARCHAR(200),
    id_destino      INT REFERENCES areas(id_area),  -- destino si aplica
    fecha           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    encargado       VARCHAR(100),
    proceso         VARCHAR(100),
    referencia_op   VARCHAR(50),
    estado          VARCHAR(20) NOT NULL DEFAULT 'GENERADO'
                    CHECK (estado IN ('GENERADO','PROCESADO','ANULADO')),
    usuario         VARCHAR(100),
    creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    procesado_en    TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE salidas IS 'Bajas de stock operativas: roturas, descomposición, mermas, consumo de personal. Se realizan diariamente para mantener control real.';

-- =============================================================================
-- 14. SALIDA_DETALLE
-- =============================================================================
CREATE TABLE salida_detalle (
    id_detalle      SERIAL PRIMARY KEY,
    id_salida       INT  NOT NULL REFERENCES salidas(id_salida) ON DELETE CASCADE,
    id_articulo     INT  NOT NULL REFERENCES articulos(id_articulo),
    cantidad_salida NUMERIC(12,3) NOT NULL,
    cantidad_costos NUMERIC(12,3),
    valor_costo     NUMERIC(12,4),
    unidad_kardex   VARCHAR(30),
    unidad_costos   VARCHAR(30)
);

-- =============================================================================
-- 15. PORCIONAMIENTOS
-- Transforma un artículo en uno o varios artículos derivados.
-- Dos casos: (a) mismo artículo con merma; (b) cambio de unidad de medida.
-- merma = cantidad_porcionar - SUM(porcionamiento_detalle.equivalente)
-- =============================================================================
CREATE TABLE porcionamientos (
    id_porcionamiento   SERIAL PRIMARY KEY,
    fecha               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    id_area             INT  NOT NULL REFERENCES areas(id_area),
    id_articulo_origen  INT  NOT NULL REFERENCES articulos(id_articulo),
    cantidad_porcionar  NUMERIC(12,3) NOT NULL,
    resultado           NUMERIC(12,3) NOT NULL DEFAULT 0,
    merma               NUMERIC(12,3) NOT NULL DEFAULT 0,
    merma_porcentaje    NUMERIC(6,2)  NOT NULL DEFAULT 0,
    estado              VARCHAR(20) NOT NULL DEFAULT 'GENERADO'
                        CHECK (estado IN ('GENERADO','PROCESADO','ANULADO')),
    usuario             VARCHAR(100),
    creado_en           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    procesado_en        TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE porcionamientos IS 'Transforma un artículo en derivados (ej: piña entera → pulpa limpia). merma_porcentaje = (merma / cantidad_porcionar) * 100, calculado al procesar.';

-- =============================================================================
-- 16. PORCIONAMIENTO_DETALLE
-- Artículos resultantes del porcionamiento con sus cantidades y equivalencias.
-- =============================================================================
CREATE TABLE porcionamiento_detalle (
    id_detalle          SERIAL PRIMARY KEY,
    id_porcionamiento   INT  NOT NULL REFERENCES porcionamientos(id_porcionamiento) ON DELETE CASCADE,
    id_articulo_destino INT  NOT NULL REFERENCES articulos(id_articulo),
    equivalente         NUMERIC(12,3) NOT NULL,  -- cantidad de origen usada para este derivado
    n_porciones         NUMERIC(12,3) NOT NULL,  -- cantidad de derivado obtenida
    peso_total          NUMERIC(12,3),
    precio_unitario     NUMERIC(12,4),
    unidad_kardex       VARCHAR(30)
);

COMMENT ON TABLE porcionamiento_detalle IS 'Artículos derivados de un porcionamiento. equivalente = cantidad del origen consumido; n_porciones = cantidad del derivado obtenido.';

-- =============================================================================
-- 17. AJUSTE_INVENTARIOS
-- Cierre y sincronización del stock físico vs sistema por área.
-- Debe ejecutarse después de completar todos los movimientos del período.
-- =============================================================================
CREATE TABLE ajuste_inventarios (
    id_ajuste       SERIAL PRIMARY KEY,
    codigo          VARCHAR(30)  NOT NULL UNIQUE,  -- ej: 00020250827
    id_area         INT  NOT NULL REFERENCES areas(id_area),
    fecha           DATE NOT NULL DEFAULT CURRENT_DATE,
    estado          VARCHAR(20) NOT NULL DEFAULT 'ABIERTO'
                    CHECK (estado IN ('ABIERTO','CERRADO')),
    usuario         VARCHAR(100),
    creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    procesado_en    TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE ajuste_inventarios IS 'Proceso de cierre de inventario por área. ABIERTO bloquea nuevos movimientos en el área hasta cerrarse. Genera stock valorizado.';

-- =============================================================================
-- 18. AJUSTE_DETALLE
-- Stock teórico vs físico por artículo. ajuste puede ser positivo o negativo.
-- =============================================================================
CREATE TABLE ajuste_detalle (
    id_detalle      SERIAL PRIMARY KEY,
    id_ajuste       INT  NOT NULL REFERENCES ajuste_inventarios(id_ajuste) ON DELETE CASCADE,
    id_articulo     INT  NOT NULL REFERENCES articulos(id_articulo),
    stock_al_cierre NUMERIC(12,3) NOT NULL DEFAULT 0,  -- lo que dice el sistema
    stock_final     NUMERIC(12,3) NOT NULL DEFAULT 0,  -- lo que dice el conteo físico
    ajuste          NUMERIC(12,3) GENERATED ALWAYS AS (stock_final - stock_al_cierre) STORED,
    precio_promedio NUMERIC(12,4) NOT NULL DEFAULT 0,
    valor_ajuste    NUMERIC(12,4) GENERATED ALWAYS AS ((stock_final - stock_al_cierre) * precio_promedio) STORED
);

COMMENT ON TABLE ajuste_detalle IS 'Comparativa sistema vs físico. ajuste = stock_final - stock_al_cierre (columna generada). valor_ajuste = ajuste * precio_promedio.';

-- =============================================================================
-- 19. KARDEX_CENTRAL
-- Registro de movimientos del almacén central con trazabilidad completa.
-- Tipo de movimiento se infiere del tipo_documento.
-- =============================================================================
CREATE TABLE kardex_central (
    id_movimiento   SERIAL PRIMARY KEY,
    id_articulo     INT  NOT NULL REFERENCES articulos(id_articulo),
    id_area         INT  NOT NULL REFERENCES areas(id_area),
    fecha_registro  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tipo_documento  VARCHAR(50),    -- Factura, RQ-xxx, TR-xxx, PO-xxx, CI-xxx, NS-xxx
    numero_documento VARCHAR(30),
    origen_destino  VARCHAR(100),
    cantidad_ingreso NUMERIC(12,3) NOT NULL DEFAULT 0,
    cantidad_salida  NUMERIC(12,3) NOT NULL DEFAULT 0,
    precio_ingreso   NUMERIC(12,4) NOT NULL DEFAULT 0,
    precio_salida    NUMERIC(12,4) NOT NULL DEFAULT 0,
    valor_ingreso    NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_salida     NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock_actual     NUMERIC(12,3) NOT NULL DEFAULT 0,
    precio_promedio  NUMERIC(12,4) NOT NULL DEFAULT 0
);

COMMENT ON TABLE kardex_central IS 'Libro de movimientos del almacén central. tipo_documento: Factura=ingreso, RQ=salida por requerimiento, TR=transferencia, PO=porcionamiento, NS=nota de salida.';

-- =============================================================================
-- 20. KARDEX_SUBALMACEN
-- Registro de movimientos por subalmacén.
-- =============================================================================
CREATE TABLE kardex_subalmacen (
    id_movimiento   SERIAL PRIMARY KEY,
    id_articulo     INT  NOT NULL REFERENCES articulos(id_articulo),
    id_area         INT  NOT NULL REFERENCES areas(id_area),
    fecha_registro  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    tipo_documento  VARCHAR(50),
    numero_documento VARCHAR(30),
    origen_destino  VARCHAR(100),
    cantidad_ingreso NUMERIC(12,3) NOT NULL DEFAULT 0,
    cantidad_salida  NUMERIC(12,3) NOT NULL DEFAULT 0,
    precio_ingreso   NUMERIC(12,4) NOT NULL DEFAULT 0,
    valor_ingreso    NUMERIC(12,2) NOT NULL DEFAULT 0,
    valor_salida     NUMERIC(12,2) NOT NULL DEFAULT 0,
    stock_actual     NUMERIC(12,3) NOT NULL DEFAULT 0,
    precio_promedio  NUMERIC(12,4) NOT NULL DEFAULT 0
);

COMMENT ON TABLE kardex_subalmacen IS 'Libro de movimientos por subalmacén (cocina, bar, pastelería, etc.). Origen indica de dónde llegó el stock (Almacen Central, transferencia).';

-- =============================================================================
-- TABLAS PIVOTE ADICIONALES
-- =============================================================================

-- 21. PIVOT: Historial de precios de compra por artículo y proveedor
CREATE TABLE pivot_precios_compra (
    id                  SERIAL PRIMARY KEY,
    id_articulo         INT  NOT NULL REFERENCES articulos(id_articulo),
    id_proveedor        INT  NOT NULL REFERENCES proveedores(id_proveedor),
    id_documento        INT  NOT NULL REFERENCES documentos(id_documento),
    precio_compra       NUMERIC(12,4) NOT NULL,
    cantidad            NUMERIC(12,3) NOT NULL,
    fecha_compra        DATE NOT NULL,
    moneda              VARCHAR(10) NOT NULL DEFAULT 'Nuevos Soles'
);

COMMENT ON TABLE pivot_precios_compra IS 'PIVOTE analítico: historial de precios de compra por artículo y proveedor. Permite análisis de variación de precios y selección de proveedor más económico.';

-- 22. PIVOT: Stock por área (vista materializada base)
CREATE TABLE pivot_stock_por_area (
    id              SERIAL PRIMARY KEY,
    id_articulo     INT  NOT NULL REFERENCES articulos(id_articulo),
    id_area         INT  NOT NULL REFERENCES areas(id_area),
    stock_actual    NUMERIC(12,3) NOT NULL DEFAULT 0,
    precio_promedio NUMERIC(12,4) NOT NULL DEFAULT 0,
    valor_total     NUMERIC(14,2) GENERATED ALWAYS AS (stock_actual * precio_promedio) STORED,
    actualizado_en  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (id_articulo, id_area)
);

COMMENT ON TABLE pivot_stock_por_area IS 'PIVOTE operativo: stock y precio promedio de cada artículo en cada área. valor_total es columna generada. Se actualiza con cada movimiento.';

-- 23. PIVOT: Mermas por período y área
CREATE TABLE pivot_mermas (
    id                  SERIAL PRIMARY KEY,
    id_porcionamiento   INT NOT NULL REFERENCES porcionamientos(id_porcionamiento),
    id_articulo         INT NOT NULL REFERENCES articulos(id_articulo),
    id_area             INT NOT NULL REFERENCES areas(id_area),
    id_familia          INT NOT NULL REFERENCES familias(id_familia),
    id_subfamilia       INT NOT NULL REFERENCES subfamilias(id_subfamilia),
    fecha               DATE NOT NULL,
    cantidad_utilizada  NUMERIC(12,3) NOT NULL,
    merma               NUMERIC(12,3) NOT NULL,
    valor_merma         NUMERIC(12,4) NOT NULL,
    porcentaje_merma    NUMERIC(6,2)  NOT NULL,
    unidad              VARCHAR(30)
);

COMMENT ON TABLE pivot_mermas IS 'PIVOTE analítico: desnormaliza mermas con datos de familia y área para reportes rápidos de merma por período, área y familia sin necesidad de múltiples JOIN.';

-- =============================================================================
-- 24. RECETAS
-- Vincula un producto del menú con los ingredientes del almacén.
-- id_producto referencia products(id) de la tabla de menú del tenant.
-- rendimiento_pct: merma esperada en producción (ej: 90 = 90%).
-- La cantidad real a descargar = cantidad_receta / (rendimiento_pct / 100).
-- =============================================================================
CREATE TABLE recetas (
    id_receta           SERIAL PRIMARY KEY,
    id_producto         INT NOT NULL,           -- FK a products(id) del tenant
    nombre              VARCHAR(200) NOT NULL,
    porciones           NUMERIC(8,3) NOT NULL DEFAULT 1,
    rendimiento_pct     NUMERIC(6,2) NOT NULL DEFAULT 100
                        CHECK (rendimiento_pct > 0 AND rendimiento_pct <= 100),
    id_area_produccion  INT REFERENCES areas(id_area),
    activo              BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modificado_en       TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE recetas IS 'Vincula un producto del menú (id_producto) con los ingredientes del almacén. rendimiento_pct ajusta la cantidad real a descargar por merma de producción.';

-- =============================================================================
-- 25. RECETA_DETALLE
-- Ingredientes (artículos del almacén) por receta con cantidad por porción.
-- es_costos: si TRUE, la cantidad está en unidad_costos y se convierte usando
--            factor_equivalencia del artículo antes de descargar.
-- es_opcional: ingrediente electivo (no se descarga automáticamente).
-- =============================================================================
CREATE TABLE receta_detalle (
    id_detalle          SERIAL PRIMARY KEY,
    id_receta           INT NOT NULL REFERENCES recetas(id_receta) ON DELETE CASCADE,
    id_articulo         INT NOT NULL REFERENCES articulos(id_articulo),
    cantidad            NUMERIC(12,4) NOT NULL,
    unidad              VARCHAR(30) NOT NULL,
    es_costos           BOOLEAN NOT NULL DEFAULT FALSE,
    es_opcional         BOOLEAN NOT NULL DEFAULT FALSE,
    observacion         VARCHAR(200),
    UNIQUE (id_receta, id_articulo)
);

COMMENT ON TABLE receta_detalle IS 'Ingredientes de cada receta. es_costos=TRUE indica que la cantidad está en gramos/ml y debe convertirse a kardex usando factor_equivalencia. es_opcional=TRUE = guarnición no descargable.';

-- =============================================================================
-- 26. LOTES
-- Rastrea cada ingreso de artículo perecible como un lote independiente.
-- Se crea automáticamente al procesar un documento cuando dias_vencimiento > 0.
-- Permite FIFO real: al descargar se consumen primero los lotes más antiguos.
-- estado se actualiza por un job diario o al momento de la consulta.
-- =============================================================================
CREATE TABLE lotes (
    id_lote             SERIAL PRIMARY KEY,
    id_articulo         INT NOT NULL REFERENCES articulos(id_articulo),
    id_area             INT NOT NULL REFERENCES areas(id_area),
    id_documento        INT REFERENCES documentos(id_documento),
    numero_lote         VARCHAR(50),            -- número de lote del proveedor
    cantidad_inicial    NUMERIC(12,3) NOT NULL,
    cantidad_actual     NUMERIC(12,3) NOT NULL,
    fecha_ingreso       DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_vencimiento   DATE,                   -- NULL = artículo no perecible
    estado              VARCHAR(20) NOT NULL DEFAULT 'vigente'
                        CHECK (estado IN ('vigente','proximo_vencer','vencido','agotado')),
    creado_en           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CHECK (cantidad_actual >= 0),
    CHECK (cantidad_actual <= cantidad_inicial)
);

COMMENT ON TABLE lotes IS 'Batch de artículo perecible creado al procesar cada documento. Permite FIFO real y alertas de vencimiento. fecha_vencimiento = fecha_ingreso + articulos.dias_vencimiento.';

-- =============================================================================
-- 27. DESCARGA_VENTA
-- Cabecera del proceso de descuento de stock por ventas completadas.
-- Se genera automáticamente cuando orders.status = completed,
-- o manualmente para un lote de pedidos (cierre de turno).
-- =============================================================================
CREATE TABLE descarga_venta (
    id_descarga         SERIAL PRIMARY KEY,
    id_orden            VARCHAR(12) NOT NULL,   -- FK a orders(id) del tenant
    id_area             INT NOT NULL REFERENCES areas(id_area),
    fecha               TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    estado              VARCHAR(20) NOT NULL DEFAULT 'GENERADO'
                        CHECK (estado IN ('GENERADO','PROCESADO','ANULADO')),
    total_costo         NUMERIC(12,4) NOT NULL DEFAULT 0,
    usuario             VARCHAR(100),
    creado_en           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    procesado_en        TIMESTAMP WITH TIME ZONE,
    UNIQUE (id_orden)   -- una descarga por pedido
);

COMMENT ON TABLE descarga_venta IS 'Descarga de stock por ventas. Una por pedido completado. Al PROCESAR, genera salidas en kardex_subalmacen y decrementa lotes por FIFO.';

-- =============================================================================
-- 28. DESCARGA_VENTA_DETALLE
-- Líneas de ingredientes a descontar por pedido, calculadas a partir de recetas.
-- precio_promedio se captura al momento del procesado (histórico inmutable).
-- =============================================================================
CREATE TABLE descarga_venta_detalle (
    id_detalle          SERIAL PRIMARY KEY,
    id_descarga         INT NOT NULL REFERENCES descarga_venta(id_descarga) ON DELETE CASCADE,
    id_articulo         INT NOT NULL REFERENCES articulos(id_articulo),
    id_receta           INT NOT NULL REFERENCES recetas(id_receta),
    cantidad            NUMERIC(12,4) NOT NULL,
    unidad              VARCHAR(30),
    precio_promedio     NUMERIC(12,4) NOT NULL DEFAULT 0,
    costo_total         NUMERIC(12,4) GENERATED ALWAYS AS (cantidad * precio_promedio) STORED
);

COMMENT ON TABLE descarga_venta_detalle IS 'Ingredientes descontados por pedido. costo_total = cantidad × precio_promedio, columna generada. precio_promedio se captura al procesar para historial de costos.';

-- =============================================================================
-- 24. USUARIOS
-- Operadores del sistema. Los campos usuario VARCHAR(100) en cada tabla de
-- movimiento contienen el nombre de un registro de esta tabla.
-- Al escribir en pivot_auditoria usar siempre id_usuario + usuario_nombre.
-- =============================================================================
CREATE TABLE usuarios (
    id_usuario      SERIAL PRIMARY KEY,
    nombre          VARCHAR(100) NOT NULL,
    email           VARCHAR(150) NOT NULL UNIQUE,
    rol             VARCHAR(50)  NOT NULL DEFAULT 'almacenero'
                    CHECK (rol IN ('admin','almacenero','supervisor','contador')),
    activo          BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    modificado_en   TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE usuarios IS 'Operadores del sistema de almacenes. Relacionado con pivot_auditoria. El campo usuario VARCHAR(100) en tablas de movimiento debe coincidir con el nombre aquí registrado.';

-- =============================================================================
-- 25. CONFIGURACION_SISTEMA
-- Parámetros operativos editables sin despliegue de código.
-- Clave primaria = nombre del parámetro para acceso directo.
-- =============================================================================
CREATE TABLE configuracion_sistema (
    clave           VARCHAR(100) PRIMARY KEY,
    valor           TEXT         NOT NULL,
    descripcion     VARCHAR(255),
    modificado_en   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    id_usuario      INT REFERENCES usuarios(id_usuario)  -- quién hizo el último cambio
);

COMMENT ON TABLE configuracion_sistema IS 'Parámetros globales del sistema (IGV, moneda, método de costeo, período activo). Se modifican en caliente; cada cambio debe generar un registro en pivot_auditoria.';

-- =============================================================================
-- 26. PIVOT_AUDITORIA
-- Registro centralizado de operaciones que alteran datos críticos.
-- Escrito desde la capa de aplicación (API), no por triggers de BD.
-- operacion distingue eventos de negocio, no solo CRUD:
--   PROCESAR → documento/requerimiento/transferencia pasa a PROCESADO
--   ANULAR   → se revierte un movimiento
--   AJUSTAR  → cierre de inventario aplica diferencias
-- usuario_nombre se desnormaliza para que el historial sea inmutable
-- aunque el usuario sea desactivado o renombrado.
-- =============================================================================
CREATE TABLE pivot_auditoria (
    id              BIGSERIAL PRIMARY KEY,
    tabla           VARCHAR(100) NOT NULL,
    operacion       VARCHAR(20)  NOT NULL
                    CHECK (operacion IN (
                        'INSERT','UPDATE','DELETE',
                        'PROCESAR','ANULAR','AJUSTAR'
                    )),
    id_registro     INTEGER,                     -- PK del registro afectado
    datos_anterior  JSONB,                       -- snapshot antes (NULL en INSERT)
    datos_nuevo     JSONB,                       -- snapshot después (NULL en DELETE)
    id_usuario      INT REFERENCES usuarios(id_usuario),
    usuario_nombre  VARCHAR(100),                -- desnormalizado: historial permanente
    modulo          VARCHAR(100),                -- 'documentos','requerimientos', etc.
    descripcion     VARCHAR(300),                -- legible: "Procesó Factura F001-0123"
    ip_address      VARCHAR(45),
    fecha           TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

COMMENT ON TABLE pivot_auditoria IS 'PIVOTE de auditoría: traza quién hizo qué y cuándo en cada módulo. usuario_nombre desnormalizado garantiza historial legible aunque el usuario sea modificado.';

-- =============================================================================
-- ÍNDICES DE RENDIMIENTO
-- =============================================================================

CREATE INDEX idx_articulos_subfamilia  ON articulos(id_subfamilia);
CREATE INDEX idx_articulos_codigo      ON articulos(codigo);
CREATE INDEX idx_articulos_activo      ON articulos(activo) WHERE activo = TRUE;

CREATE INDEX idx_documento_proveedor   ON documentos(id_proveedor);
CREATE INDEX idx_documento_area        ON documentos(id_area);
CREATE INDEX idx_documento_estado      ON documentos(estado);
CREATE INDEX idx_documento_fecha       ON documentos(fecha_ingreso);

CREATE INDEX idx_req_area              ON requerimientos(id_area);
CREATE INDEX idx_req_estado            ON requerimientos(estado);
CREATE INDEX idx_req_fecha             ON requerimientos(fecha);

CREATE INDEX idx_trans_origen          ON transferencias(id_area_origen);
CREATE INDEX idx_trans_destino         ON transferencias(id_area_destino);
CREATE INDEX idx_trans_estado          ON transferencias(estado);

CREATE INDEX idx_salida_area           ON salidas(id_area);
CREATE INDEX idx_salida_fecha          ON salidas(fecha);

CREATE INDEX idx_kardex_c_articulo     ON kardex_central(id_articulo);
CREATE INDEX idx_kardex_c_area         ON kardex_central(id_area);
CREATE INDEX idx_kardex_c_fecha        ON kardex_central(fecha_registro);

CREATE INDEX idx_kardex_s_articulo     ON kardex_subalmacen(id_articulo);
CREATE INDEX idx_kardex_s_area         ON kardex_subalmacen(id_area);
CREATE INDEX idx_kardex_s_fecha        ON kardex_subalmacen(fecha_registro);

CREATE INDEX idx_pivot_stock_area      ON pivot_stock_por_area(id_area);
CREATE INDEX idx_pivot_stock_articulo  ON pivot_stock_por_area(id_articulo);

CREATE INDEX idx_pivot_mermas_fecha    ON pivot_mermas(fecha);
CREATE INDEX idx_pivot_mermas_area     ON pivot_mermas(id_area);

CREATE INDEX idx_recetas_producto      ON recetas(id_producto);
CREATE INDEX idx_recetas_area          ON recetas(id_area_produccion);
CREATE INDEX idx_receta_det_receta     ON receta_detalle(id_receta);
CREATE INDEX idx_receta_det_articulo   ON receta_detalle(id_articulo);

CREATE INDEX idx_lotes_articulo        ON lotes(id_articulo);
CREATE INDEX idx_lotes_area            ON lotes(id_area);
CREATE INDEX idx_lotes_estado          ON lotes(estado);
CREATE INDEX idx_lotes_vencimiento     ON lotes(fecha_vencimiento) WHERE fecha_vencimiento IS NOT NULL;
CREATE INDEX idx_lotes_activos         ON lotes(id_articulo, id_area) WHERE estado IN ('vigente','proximo_vencer');

CREATE INDEX idx_descarga_orden        ON descarga_venta(id_orden);
CREATE INDEX idx_descarga_area         ON descarga_venta(id_area);
CREATE INDEX idx_descarga_estado       ON descarga_venta(estado);
CREATE INDEX idx_descarga_det_descarga ON descarga_venta_detalle(id_descarga);
CREATE INDEX idx_descarga_det_articulo ON descarga_venta_detalle(id_articulo);

CREATE INDEX idx_usuarios_activo       ON usuarios(activo) WHERE activo = TRUE;
CREATE INDEX idx_usuarios_email        ON usuarios(email);

CREATE INDEX idx_auditoria_tabla       ON pivot_auditoria(tabla);
CREATE INDEX idx_auditoria_fecha       ON pivot_auditoria(fecha);
CREATE INDEX idx_auditoria_usuario     ON pivot_auditoria(id_usuario);
CREATE INDEX idx_auditoria_modulo      ON pivot_auditoria(modulo);
CREATE INDEX idx_auditoria_registro    ON pivot_auditoria(tabla, id_registro);

-- =============================================================================
-- DATOS SEMILLA — Áreas base
-- =============================================================================

INSERT INTO areas (nombre, tipo, es_central) VALUES
  ('Almacen Central',       'temperatura_ambiente', TRUE),
  ('Bar',                   'subalmacen',           FALSE),
  ('Cocina',                'subalmacen',           FALSE),
  ('Pasteleria',            'subalmacen',           FALSE),
  ('Cava',                  'frio',                 FALSE),
  ('Salon',                 'subalmacen',           FALSE),
  ('Mantenimiento',         'subalmacen',           FALSE),
  ('Antojitos y Sandwich',  'subalmacen',           FALSE),
  ('Jugos',                 'subalmacen',           FALSE),
  ('Panaderia',             'subalmacen',           FALSE),
  ('Cocina Local',          'subalmacen',           FALSE),
  ('Barra Local',           'subalmacen',           FALSE);

INSERT INTO familias (nombre) VALUES
  ('Alimentos'),
  ('Bebidas'),
  ('Licores'),
  ('Quimicos y Limpieza'),
  ('Smallware y Uniformes'),
  ('Activos');

INSERT INTO configuracion_sistema (clave, valor, descripcion) VALUES
  ('igv_porcentaje',    '18',           'Tasa de IGV (%) aplicada a compras gravadas'),
  ('moneda_defecto',    'Nuevos Soles', 'Moneda base del sistema'),
  ('metodo_costeo',     'PP',           'Método de costeo: PP = Precio Promedio Ponderado'),
  ('periodo_activo',    '',             'Período contable activo AAAA-MM; vacío = sin restricción'),
  ('stock_alerta_dias', '3',            'Días de anticipación para alertas de stock bajo mínimo');

INSERT INTO subfamilias (id_familia, nombre) VALUES
  (1, 'Abarrotes'),
  (1, 'Carnes y Pescados'),
  (1, 'Frutas'),
  (1, 'Verduras'),
  (1, 'Lacteos'),
  (2, 'Bebidas sin Alcohol'),
  (3, 'Vinos y Espumantes'),
  (3, 'Destilados'),
  (4, 'Detergentes'),
  (4, 'Desinfectantes'),
  (5, 'Menaje'),
  (5, 'Uniformes');

-- =============================================================================
-- VISTAS ÚTILES
-- =============================================================================

CREATE OR REPLACE VIEW v_stock_valorizado AS
SELECT
    a.codigo,
    a.descripcion_resumida,
    f.nombre  AS familia,
    sf.nombre AS subfamilia,
    ar.nombre AS area,
    p.stock_actual,
    a.unidad_kardex,
    p.precio_promedio,
    p.valor_total,
    p.actualizado_en
FROM pivot_stock_por_area p
JOIN articulos   a  ON a.id_articulo  = p.id_articulo
JOIN subfamilias sf ON sf.id_subfamilia = a.id_subfamilia
JOIN familias    f  ON f.id_familia   = sf.id_familia
JOIN areas       ar ON ar.id_area     = p.id_area
ORDER BY ar.nombre, f.nombre, a.descripcion_resumida;

COMMENT ON VIEW v_stock_valorizado IS 'Vista consolidada de stock valorizado por área, con familia y subfamilia. Útil para reportes contables y toma de decisiones.';

CREATE OR REPLACE VIEW v_reporte_mermas AS
SELECT
    pm.fecha,
    ar.nombre  AS area,
    f.nombre   AS familia,
    sf.nombre  AS subfamilia,
    a.descripcion_resumida AS producto,
    a.unidad_kardex AS unidad,
    pm.cantidad_utilizada,
    pm.merma,
    pm.valor_merma,
    pm.porcentaje_merma
FROM pivot_mermas pm
JOIN articulos   a  ON a.id_articulo   = pm.id_articulo
JOIN areas       ar ON ar.id_area      = pm.id_area
JOIN familias    f  ON f.id_familia    = pm.id_familia
JOIN subfamilias sf ON sf.id_subfamilia = pm.id_subfamilia
ORDER BY pm.fecha DESC, ar.nombre, pm.porcentaje_merma DESC;

COMMENT ON VIEW v_reporte_mermas IS 'Vista para el reporte de mermas ordenado por fecha y área, equivalente al reporte Reportes → Mermas del sistema.';

CREATE OR REPLACE VIEW v_auditoria_reciente AS
SELECT
    pa.id,
    pa.fecha,
    pa.modulo,
    pa.tabla,
    pa.operacion,
    pa.id_registro,
    pa.descripcion,
    pa.usuario_nombre,
    u.rol             AS usuario_rol,
    pa.ip_address,
    pa.datos_anterior,
    pa.datos_nuevo
FROM pivot_auditoria pa
LEFT JOIN usuarios u ON u.id_usuario = pa.id_usuario
ORDER BY pa.fecha DESC;

COMMENT ON VIEW v_auditoria_reciente IS 'Auditoría completa ordenada por fecha DESC con rol del usuario. Combina los snapshots JSONB para comparación antes/después.';

-- -----------------------------------------------------------------------------
-- v_costo_receta
-- Costo actual de cada receta valorizado con el precio_promedio vigente.
-- Se recalcula automáticamente cada vez que se consulta (no materializada).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_costo_receta AS
SELECT
    r.id_receta,
    r.id_producto,
    r.nombre                                        AS receta,
    r.porciones,
    r.rendimiento_pct,
    ar.nombre                                       AS area_produccion,
    a.id_articulo,
    a.descripcion_resumida                          AS ingrediente,
    a.unidad_kardex,
    rd.cantidad,
    rd.es_costos,
    rd.es_opcional,
    CASE
        WHEN rd.es_costos THEN rd.cantidad / NULLIF(a.factor_equivalencia, 0)
        ELSE rd.cantidad
    END                                             AS cantidad_kardex,
    a.precio_promedio,
    ROUND(
        CASE
            WHEN rd.es_costos THEN rd.cantidad / NULLIF(a.factor_equivalencia, 0)
            ELSE rd.cantidad
        END
        / (r.rendimiento_pct / 100.0)
        * a.precio_promedio,
    4)                                              AS costo_ingrediente
FROM recetas r
JOIN receta_detalle rd ON rd.id_receta    = r.id_receta
JOIN articulos      a  ON a.id_articulo   = rd.id_articulo
LEFT JOIN areas     ar ON ar.id_area      = r.id_area_produccion
WHERE r.activo = TRUE AND rd.es_opcional = FALSE;

COMMENT ON VIEW v_costo_receta IS 'Costo por ingrediente de cada receta, valorizado con precio_promedio actual. Incluye conversión de unidad_costos a unidad_kardex y ajuste por rendimiento_pct.';

-- -----------------------------------------------------------------------------
-- v_stock_alerta
-- Artículos cuyo stock en algún área está por debajo del stock_minimo.
-- Incluye el déficit (cuánto falta para llegar al mínimo).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_stock_alerta AS
SELECT
    a.codigo,
    a.descripcion_resumida                          AS articulo,
    f.nombre                                        AS familia,
    ar.nombre                                       AS area,
    p.stock_actual,
    a.stock_minimo,
    a.stock_ideal,
    ROUND(a.stock_minimo - p.stock_actual, 3)       AS deficit,
    a.unidad_kardex,
    ROUND(p.stock_actual * p.precio_promedio, 2)    AS valor_stock_actual
FROM pivot_stock_por_area p
JOIN articulos   a  ON a.id_articulo   = p.id_articulo
JOIN subfamilias sf ON sf.id_subfamilia = a.id_subfamilia
JOIN familias    f  ON f.id_familia    = sf.id_familia
JOIN areas       ar ON ar.id_area      = p.id_area
WHERE a.activo = TRUE
  AND a.stock_minimo > 0
  AND p.stock_actual < a.stock_minimo
ORDER BY deficit DESC, ar.nombre, a.descripcion_resumida;

COMMENT ON VIEW v_stock_alerta IS 'Artículos por debajo del stock_minimo en cualquier área. deficit = stock_minimo - stock_actual. Usar para generar alertas de reabastecimiento.';

-- -----------------------------------------------------------------------------
-- v_articulos_por_vencer
-- Lotes perecibles en estado proximo_vencer o vencido, con días restantes
-- y valor en riesgo. Base para alertas de caducidad.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_articulos_por_vencer AS
SELECT
    l.id_lote,
    a.codigo,
    a.descripcion_resumida                          AS articulo,
    ar.nombre                                       AS area,
    l.numero_lote,
    l.cantidad_actual,
    a.unidad_kardex,
    l.fecha_ingreso,
    l.fecha_vencimiento,
    (l.fecha_vencimiento - CURRENT_DATE)            AS dias_restantes,
    l.estado,
    ROUND(l.cantidad_actual * psa.precio_promedio, 2) AS valor_en_riesgo
FROM lotes l
JOIN articulos          a   ON a.id_articulo   = l.id_articulo
JOIN areas              ar  ON ar.id_area       = l.id_area
LEFT JOIN pivot_stock_por_area psa
                        ON  psa.id_articulo = l.id_articulo
                        AND psa.id_area     = l.id_area
WHERE l.estado IN ('proximo_vencer', 'vencido')
  AND l.cantidad_actual > 0
ORDER BY l.fecha_vencimiento ASC, ar.nombre;

COMMENT ON VIEW v_articulos_por_vencer IS 'Lotes perecibles próximos a vencer o ya vencidos con stock disponible. dias_restantes negativo = ya vencido. valor_en_riesgo = cantidad × precio_promedio del área.';

-- -----------------------------------------------------------------------------
-- v_rentabilidad_producto
-- Precio de venta del producto vs costo total de su receta (por porción).
-- Permite identificar platos con margen bajo o negativo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_rentabilidad_producto AS
SELECT
    r.id_producto,
    r.nombre                                            AS receta,
    r.porciones,
    ar.nombre                                           AS area_produccion,
    SUM(
        ROUND(
            CASE WHEN rd.es_costos
                THEN rd.cantidad / NULLIF(a.factor_equivalencia, 0)
                ELSE rd.cantidad
            END
            / (r.rendimiento_pct / 100.0)
            * a.precio_promedio,
        4)
    )                                                   AS costo_total_receta,
    COUNT(rd.id_detalle)                                AS num_ingredientes
FROM recetas r
JOIN receta_detalle rd ON rd.id_receta  = r.id_receta AND rd.es_opcional = FALSE
JOIN articulos      a  ON a.id_articulo = rd.id_articulo
LEFT JOIN areas     ar ON ar.id_area    = r.id_area_produccion
WHERE r.activo = TRUE
GROUP BY r.id_receta, r.id_producto, r.nombre, r.porciones,
         r.rendimiento_pct, ar.nombre;

COMMENT ON VIEW v_rentabilidad_producto IS 'Costo total por receta (excluyendo ingredientes opcionales) para cruzar con precio_venta del producto. Permite análisis de food cost y margen bruto por plato.';

