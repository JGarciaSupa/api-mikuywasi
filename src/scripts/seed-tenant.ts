/**
 * Seed genérico para un tenant.
 * Uso: bun run src/scripts/seed-tenant.ts <tenantId>
 *
 * Crea datos demo en: tenant_configs, payment_methods, tables, categories,
 * products, social_links, item_families, item_subfamilies, storage_areas,
 * suppliers, items, item_area_assignments y un usuario admin.
 *
 * Es IDEMPOTENTE: usa onConflictDoNothing en todos los inserts.
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { masterDb } from '../db';
import { tenants } from '../db/master/schema';
import { eq } from 'drizzle-orm';
import * as s from '../db/tenant/schema';

// ─── CLI arg ──────────────────────────────────────────────────────────────────

const tenantId = parseInt(process.argv[2]);
if (!tenantId || isNaN(tenantId)) {
  console.error('❌ Uso: bun run src/scripts/seed-tenant.ts <tenantId>');
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const log = (msg: string) => console.log(`  ✅ ${msg}`);
const section = (title: string) => console.log(`\n📦 ${title}`);

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🚀 Seeding tenant ID: ${tenantId}\n`);

  // 1. Buscar tenant en BD maestra
  const tenant = await masterDb.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    with: { server: true },
  });
  if (!tenant) { console.error('❌ Tenant no encontrado'); process.exit(1); }
  if (!tenant.server) { console.error('❌ Servidor no configurado'); process.exit(1); }

  const { server } = tenant;
  const dbHost = process.env.DB_HOST_OVERRIDE || server.dbHost;
  const connectionString = `postgres://${encodeURIComponent(server.dbUser)}:${encodeURIComponent(server.dbPassword)}@${dbHost}:${server.dbPort}/${tenant.dbName}`;

  console.log(`  Tenant: ${tenant.name} (${tenant.slug})`);
  console.log(`  DB:     ${tenant.dbName} @ ${dbHost}`);

  const pool = new Pool({ connectionString, max: 1 });
  const db = drizzle(pool, { schema: s });

  try {
    // ── tenant_configs ──────────────────────────────────────────────────────
    section('tenant_configs');
    const [existing] = await db.select().from(s.tenantConfigs);
    if (existing) {
      await db.update(s.tenantConfigs)
        .set({
          phone: '987654321',
          whatsapp: '987654321',
          email: 'contacto@restaurante.com',
          category: 'Restaurante',
          hasDineIn: true,
          hasDelivery: true,
          hasPickup: true,
          fiscalId: '20123456789',
          fiscalName: 'RESTAURANTE DEMO S.A.C.',
          schedules: [
            { day: 'Lunes', startTime: '08:00', endTime: '22:00', closed: false },
            { day: 'Martes', startTime: '08:00', endTime: '22:00', closed: false },
            { day: 'Miércoles', startTime: '08:00', endTime: '22:00', closed: false },
            { day: 'Jueves', startTime: '08:00', endTime: '22:00', closed: false },
            { day: 'Viernes', startTime: '08:00', endTime: '22:00', closed: false },
            { day: 'Sábado', startTime: '09:00', endTime: '23:00', closed: false },
            { day: 'Domingo', startTime: '09:00', endTime: '22:00', closed: false },
          ],
        })
        .where(eq(s.tenantConfigs.id, existing.id));
      log('tenant_configs actualizado');
    } else {
      await db.insert(s.tenantConfigs).values({
        phone: '987654321',
        whatsapp: '987654321',
        email: 'contacto@restaurante.com',
        category: 'Restaurante',
        hasDineIn: true,
        hasDelivery: true,
        hasPickup: true,
        fiscalId: '20123456789',
        fiscalName: 'RESTAURANTE DEMO S.A.C.',
      });
      log('tenant_configs creado');
    }

    // ── payment_methods ─────────────────────────────────────────────────────
    section('payment_methods');
    await db.insert(s.paymentMethods).values([
      { name: 'Efectivo' },
      { name: 'Yape / Plin' },
      { name: 'Tarjeta' },
      { name: 'Transferencia' },
    ]).onConflictDoNothing();
    log('4 métodos de pago');

    // ── tables ──────────────────────────────────────────────────────────────
    section('restaurant_tables');
    const tableData = Array.from({ length: 8 }, (_, i) => ({
      name: `Mesa ${i + 1}`,
      slug: `M${String(i + 1).padStart(3, '0')}${Math.random().toString(36).slice(2, 5).toUpperCase()}`,
    }));
    await db.insert(s.tables).values(tableData).onConflictDoNothing();
    log('8 mesas');

    // ── categories ──────────────────────────────────────────────────────────
    section('categories');
    const [cat1] = await db.insert(s.categories).values({ name: 'Entradas', order: 1 }).returning().onConflictDoNothing();
    const [cat2] = await db.insert(s.categories).values({ name: 'Platos de Fondo', order: 2 }).returning().onConflictDoNothing();
    const [cat3] = await db.insert(s.categories).values({ name: 'Bebidas', order: 3 }).returning().onConflictDoNothing();
    const [cat4] = await db.insert(s.categories).values({ name: 'Postres', order: 4 }).returning().onConflictDoNothing();

    const cats = await db.select().from(s.categories);
    const catMap: Record<string, number> = {};
    cats.forEach((c) => { catMap[c.name] = c.id; });
    log(`${cats.length} categorías`);

    // ── products ────────────────────────────────────────────────────────────
    section('products');
    const productData = [
      { categoryId: catMap['Entradas'], name: 'Ceviche de pescado', description: 'Ceviche fresco con leche de tigre', price: '18.00', order: 1 },
      { categoryId: catMap['Entradas'], name: 'Tequeños de queso', description: '6 unidades con dip de guacamole', price: '12.00', order: 2 },
      { categoryId: catMap['Entradas'], name: 'Causa limeña', description: 'Causa rellena de atún y palta', price: '14.00', order: 3 },
      { categoryId: catMap['Platos de Fondo'], name: 'Lomo saltado', description: 'Lomo fino con papas fritas y arroz', price: '28.00', order: 1 },
      { categoryId: catMap['Platos de Fondo'], name: 'Arroz con pollo', description: 'Arroz verde con pollo y salsa criolla', price: '22.00', order: 2 },
      { categoryId: catMap['Platos de Fondo'], name: 'Seco de res', description: 'Seco norteño con frijoles y arroz', price: '25.00', order: 3 },
      { categoryId: catMap['Platos de Fondo'], name: 'Trucha a la plancha', description: 'Trucha grillada con ensalada y papas', price: '30.00', order: 4 },
      { categoryId: catMap['Bebidas'], name: 'Chicha morada', description: 'Chicha morada de la casa 1L', price: '8.00', order: 1 },
      { categoryId: catMap['Bebidas'], name: 'Limonada frozen', description: 'Limonada con hielo frappe', price: '10.00', order: 2 },
      { categoryId: catMap['Bebidas'], name: 'Gaseosa', description: 'Coca-Cola, Sprite o Inca Kola', price: '5.00', order: 3 },
      { categoryId: catMap['Postres'], name: 'Suspiro limeño', description: 'Suspiro clásico con canela', price: '9.00', order: 1 },
      { categoryId: catMap['Postres'], name: 'Mazamorra morada', description: 'Con arroz con leche', price: '8.00', order: 2 },
    ].filter((p) => p.categoryId);
    await db.insert(s.products).values(productData as any).onConflictDoNothing();
    log(`${productData.length} productos`);

    // ── social_links ────────────────────────────────────────────────────────
    section('social_links');
    await db.insert(s.socialLinks).values([
      { platform: 'instagram', url: 'https://instagram.com/restaurantedemo', order: 0 },
      { platform: 'facebook', url: 'https://facebook.com/restaurantedemo', order: 1 },
      { platform: 'whatsapp', url: 'https://wa.me/51987654321', order: 2 },
    ]).onConflictDoNothing();
    log('3 redes sociales');

    // ── item_families ───────────────────────────────────────────────────────
    section('item_families');
    const familyRows = await db.insert(s.itemFamilies).values([
      { name: 'Carnes y Aves' },
      { name: 'Verduras y Frutas' },
      { name: 'Abarrotes' },
      { name: 'Lácteos' },
      { name: 'Bebidas e Insumos' },
      { name: 'Condimentos y Especias' },
    ]).returning().onConflictDoNothing();
    // Si ya existían, buscarlos
    const allFamilies = await db.select().from(s.itemFamilies);
    const fMap: Record<string, number> = {};
    allFamilies.forEach((f) => { fMap[f.name] = f.id; });
    log(`${allFamilies.length} familias`);

    // ── item_subfamilies ────────────────────────────────────────────────────
    section('item_subfamilies');
    const subfamilyData = [
      { familyId: fMap['Carnes y Aves'], name: 'Res' },
      { familyId: fMap['Carnes y Aves'], name: 'Pollo' },
      { familyId: fMap['Carnes y Aves'], name: 'Cerdo' },
      { familyId: fMap['Carnes y Aves'], name: 'Pescado y Mariscos' },
      { familyId: fMap['Verduras y Frutas'], name: 'Verduras' },
      { familyId: fMap['Verduras y Frutas'], name: 'Frutas' },
      { familyId: fMap['Abarrotes'], name: 'Granos y Cereales' },
      { familyId: fMap['Abarrotes'], name: 'Aceites y Salsas' },
      { familyId: fMap['Lácteos'], name: 'Quesos y Huevos' },
      { familyId: fMap['Lácteos'], name: 'Cremas y Mantequilla' },
      { familyId: fMap['Bebidas e Insumos'], name: 'Bebidas' },
      { familyId: fMap['Condimentos y Especias'], name: 'Especias' },
    ].filter((sf) => sf.familyId);
    await db.insert(s.itemSubfamilies).values(subfamilyData as any).onConflictDoNothing();
    const allSubfamilies = await db.select().from(s.itemSubfamilies);
    const sfMap: Record<string, number> = {};
    allSubfamilies.forEach((sf) => { sfMap[sf.name] = sf.id; });
    log(`${allSubfamilies.length} subfamilias`);

    // ── storage_areas ───────────────────────────────────────────────────────
    section('storage_areas');
    await db.insert(s.storageAreas).values([
      { name: 'Almacén Central', type: 'ambient', isCentral: true, description: 'Área central de recepción y control de stock' },
      { name: 'Cocina', type: 'ambient', isCentral: false, description: 'Área de producción y elaboración' },
      { name: 'Refrigeración', type: 'cold', isCentral: false, description: 'Cámara fría para carnes y lácteos' },
      { name: 'Bar', type: 'ambient', isCentral: false, description: 'Área de bebidas y postres' },
    ]).onConflictDoNothing();
    const allAreas = await db.select().from(s.storageAreas);
    const areaMap: Record<string, number> = {};
    allAreas.forEach((a) => { areaMap[a.name] = a.id; });
    log(`${allAreas.length} áreas de almacén`);

    // ── suppliers ───────────────────────────────────────────────────────────
    section('suppliers');
    await db.insert(s.suppliers).values([
      { taxId: '20456789012', legalName: 'DISTRIBUIDORA ALIMENTOS DEL PERU S.A.C.', tradeName: 'Dist. Alimentos Perú', contactPerson: 'Juan Pérez', phone: '01-234-5678', email: 'ventas@distalimenosperu.com' },
      { taxId: '20345678901', legalName: 'CARNICERÍA EL BUEN SABOR E.I.R.L.', tradeName: 'El Buen Sabor', contactPerson: 'María García', phone: '987654321', email: 'pedidos@elbuensabor.com' },
      { taxId: '20567890123', legalName: 'VERDURAS FRESCAS DEL CAMPO S.A.C.', tradeName: 'Verduras del Campo', contactPerson: 'Luis Torres', phone: '976543210', email: 'contacto@verdurasfrescas.com' },
    ]).onConflictDoNothing();
    log('3 proveedores');

    // ── items ────────────────────────────────────────────────────────────────
    section('items');
    const itemsData = [
      // Carnes
      { code: 'CAR-001', fullDescription: 'Lomo fino de res', shortDescription: 'Lomo fino', subfamilyId: sfMap['Res'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '5.000', avgPrice: '35.0000', minStock: '2', maxStock: '15' },
      { code: 'CAR-002', fullDescription: 'Pechuga de pollo sin hueso', shortDescription: 'Pechuga pollo', subfamilyId: sfMap['Pollo'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '8.000', avgPrice: '12.0000', minStock: '3', maxStock: '20' },
      { code: 'CAR-003', fullDescription: 'Filete de trucha fresca', shortDescription: 'Trucha filete', subfamilyId: sfMap['Pescado y Mariscos'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '4.000', avgPrice: '22.0000', minStock: '2', maxStock: '10' },
      { code: 'CAR-004', fullDescription: 'Filete de pescado (merluza)', shortDescription: 'Filete merluza', subfamilyId: sfMap['Pescado y Mariscos'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '3.000', avgPrice: '18.0000', minStock: '1', maxStock: '8', portionable: true },
      // Verduras
      { code: 'VER-001', fullDescription: 'Papa blanca por kilogramo', shortDescription: 'Papa blanca', subfamilyId: sfMap['Verduras'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '20.000', avgPrice: '2.5000', minStock: '5', maxStock: '50' },
      { code: 'VER-002', fullDescription: 'Cebolla roja por kilogramo', shortDescription: 'Cebolla roja', subfamilyId: sfMap['Verduras'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '10.000', avgPrice: '2.0000', minStock: '3', maxStock: '20' },
      { code: 'VER-003', fullDescription: 'Tomate fresco por kilogramo', shortDescription: 'Tomate', subfamilyId: sfMap['Verduras'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '8.000', avgPrice: '2.5000', minStock: '2', maxStock: '15' },
      { code: 'VER-004', fullDescription: 'Ajo pelado por kilogramo', shortDescription: 'Ajo pelado', subfamilyId: sfMap['Verduras'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '2.000', avgPrice: '12.0000', minStock: '0.5', maxStock: '5' },
      { code: 'VER-005', fullDescription: 'Limón sutil por kilogramo', shortDescription: 'Limón sutil', subfamilyId: sfMap['Verduras'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '5.000', avgPrice: '3.0000', minStock: '2', maxStock: '10' },
      // Abarrotes
      { code: 'ABA-001', fullDescription: 'Arroz extra por kilogramo', shortDescription: 'Arroz extra', subfamilyId: sfMap['Granos y Cereales'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '25.000', avgPrice: '3.5000', minStock: '5', maxStock: '50' },
      { code: 'ABA-002', fullDescription: 'Aceite vegetal litro', shortDescription: 'Aceite vegetal', subfamilyId: sfMap['Aceites y Salsas'], ledgerUnit: 'LT', costUnit: 'LT', currentStock: '6.000', avgPrice: '8.0000', minStock: '2', maxStock: '12' },
      { code: 'ABA-003', fullDescription: 'Sillao / Soya oscuro 1L', shortDescription: 'Sillao', subfamilyId: sfMap['Aceites y Salsas'], ledgerUnit: 'LT', costUnit: 'LT', currentStock: '3.000', avgPrice: '6.0000', minStock: '1', maxStock: '6' },
      // Lácteos
      { code: 'LAC-001', fullDescription: 'Queso fresco por kilogramo', shortDescription: 'Queso fresco', subfamilyId: sfMap['Quesos y Huevos'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '3.000', avgPrice: '18.0000', minStock: '1', maxStock: '8' },
      { code: 'LAC-002', fullDescription: 'Huevos por unidad', shortDescription: 'Huevo', subfamilyId: sfMap['Quesos y Huevos'], ledgerUnit: 'UND', costUnit: 'UND', currentStock: '60.000', avgPrice: '0.5000', minStock: '12', maxStock: '120' },
      // Bebidas
      { code: 'BEB-001', fullDescription: 'Maíz morado seco por kilogramo', shortDescription: 'Maíz morado', subfamilyId: sfMap['Bebidas'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '4.000', avgPrice: '5.0000', minStock: '1', maxStock: '10' },
      { code: 'BEB-002', fullDescription: 'Azúcar rubia por kilogramo', shortDescription: 'Azúcar rubia', subfamilyId: sfMap['Especias'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '10.000', avgPrice: '3.0000', minStock: '3', maxStock: '20' },
      // Especias
      { code: 'ESP-001', fullDescription: 'Ají amarillo pasta por kilogramo', shortDescription: 'Ají amarillo pasta', subfamilyId: sfMap['Especias'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '2.000', avgPrice: '8.0000', minStock: '0.5', maxStock: '5' },
      { code: 'ESP-002', fullDescription: 'Culantro fresco por kilogramo', shortDescription: 'Culantro', subfamilyId: sfMap['Verduras'], ledgerUnit: 'KG', costUnit: 'KG', currentStock: '1.000', avgPrice: '4.0000', minStock: '0.3', maxStock: '3' },
    ].filter((i) => i.subfamilyId);
    await db.insert(s.items).values(itemsData as any).onConflictDoNothing();
    const allItems = await db.select().from(s.items);
    log(`${allItems.length} artículos`);

    // ── item_area_assignments ────────────────────────────────────────────────
    section('item_area_assignments');
    const central = areaMap['Almacén Central'];
    const kitchen = areaMap['Cocina'];
    const cold = areaMap['Refrigeración'];
    if (central && kitchen && cold && allItems.length) {
      const assignments: { itemId: number; areaId: number }[] = [];
      for (const item of allItems) {
        assignments.push({ itemId: item.id, areaId: central });
        const isPerishable = ['CAR-001','CAR-002','CAR-003','CAR-004','LAC-001','LAC-002'].includes(item.code);
        if (isPerishable && cold) assignments.push({ itemId: item.id, areaId: cold });
        const isKitchen = !['BEB-001','BEB-002'].includes(item.code);
        if (isKitchen && kitchen) assignments.push({ itemId: item.id, areaId: kitchen });
      }
      await db.insert(s.itemAreaAssignments).values(assignments).onConflictDoNothing();
      log(`${assignments.length} asignaciones ítem-área`);
    }

    // ── recipes ──────────────────────────────────────────────────────────────
    section('recipes');
    const allProducts = await db.select().from(s.products);
    const prodMap: Record<string, number> = {};
    allProducts.forEach((p) => { prodMap[p.name] = p.id; });
    const iMap: Record<string, number> = {};
    allItems.forEach((i) => { iMap[i.code] = i.id; });
    const kitchenAreaId = areaMap['Cocina'];

    type RecipeDef = {
      productName: string;
      recipeName: string;
      servings: string;
      lines: { code: string; qty: string; unit: string; isCost: boolean; isOptional?: boolean; notes?: string }[];
    };

    const recipeDefs: RecipeDef[] = [
      {
        productName: 'Lomo saltado',
        recipeName: 'Receta Lomo Saltado',
        servings: '1',
        lines: [
          { code: 'CAR-001', qty: '0.200', unit: 'KG', isCost: true, notes: 'Lomo fino cortado en tiras' },
          { code: 'VER-001', qty: '0.150', unit: 'KG', isCost: true, notes: 'Papa frita en bastones' },
          { code: 'VER-002', qty: '0.080', unit: 'KG', isCost: true },
          { code: 'VER-003', qty: '0.060', unit: 'KG', isCost: true },
          { code: 'VER-004', qty: '0.005', unit: 'KG', isCost: false },
          { code: 'ABA-002', qty: '0.020', unit: 'LT', isCost: false },
          { code: 'ABA-003', qty: '0.015', unit: 'LT', isCost: true, notes: 'Sillao para el saltado' },
          { code: 'ABA-001', qty: '0.120', unit: 'KG', isCost: true, notes: 'Arroz cocido' },
        ],
      },
      {
        productName: 'Arroz con pollo',
        recipeName: 'Receta Arroz con Pollo',
        servings: '1',
        lines: [
          { code: 'CAR-002', qty: '0.250', unit: 'KG', isCost: true },
          { code: 'ABA-001', qty: '0.150', unit: 'KG', isCost: true },
          { code: 'ESP-002', qty: '0.030', unit: 'KG', isCost: true, notes: 'Para el color verde' },
          { code: 'VER-004', qty: '0.008', unit: 'KG', isCost: false },
          { code: 'VER-002', qty: '0.050', unit: 'KG', isCost: false },
          { code: 'ABA-002', qty: '0.015', unit: 'LT', isCost: false },
          { code: 'ESP-001', qty: '0.010', unit: 'KG', isCost: true, isOptional: true },
        ],
      },
      {
        productName: 'Seco de res',
        recipeName: 'Receta Seco de Res',
        servings: '1',
        lines: [
          { code: 'CAR-001', qty: '0.220', unit: 'KG', isCost: true },
          { code: 'ESP-002', qty: '0.020', unit: 'KG', isCost: true },
          { code: 'ESP-001', qty: '0.015', unit: 'KG', isCost: true },
          { code: 'VER-004', qty: '0.008', unit: 'KG', isCost: false },
          { code: 'VER-002', qty: '0.060', unit: 'KG', isCost: false },
          { code: 'ABA-001', qty: '0.120', unit: 'KG', isCost: true, notes: 'Arroz acompañante' },
          { code: 'ABA-002', qty: '0.015', unit: 'LT', isCost: false },
        ],
      },
      {
        productName: 'Trucha a la plancha',
        recipeName: 'Receta Trucha a la Plancha',
        servings: '1',
        lines: [
          { code: 'CAR-003', qty: '0.300', unit: 'KG', isCost: true },
          { code: 'VER-005', qty: '0.050', unit: 'KG', isCost: true, notes: 'Limón para marinar' },
          { code: 'VER-004', qty: '0.005', unit: 'KG', isCost: false },
          { code: 'VER-001', qty: '0.150', unit: 'KG', isCost: true, notes: 'Papa sancochada' },
          { code: 'ABA-002', qty: '0.015', unit: 'LT', isCost: false },
        ],
      },
      {
        productName: 'Ceviche de pescado',
        recipeName: 'Receta Ceviche de Pescado',
        servings: '1',
        lines: [
          { code: 'CAR-004', qty: '0.200', unit: 'KG', isCost: true, notes: 'Filete en cubos' },
          { code: 'VER-005', qty: '0.080', unit: 'KG', isCost: true, notes: 'Limón para la leche de tigre' },
          { code: 'VER-002', qty: '0.060', unit: 'KG', isCost: true, notes: 'Cebolla en juliana' },
          { code: 'ESP-001', qty: '0.008', unit: 'KG', isCost: true },
          { code: 'ESP-002', qty: '0.005', unit: 'KG', isCost: false, isOptional: true },
          { code: 'VER-001', qty: '0.100', unit: 'KG', isCost: true, notes: 'Camote o choclo' },
        ],
      },
      {
        productName: 'Chicha morada',
        recipeName: 'Receta Chicha Morada 1L',
        servings: '1',
        lines: [
          { code: 'BEB-001', qty: '0.100', unit: 'KG', isCost: true, notes: 'Maíz morado seco' },
          { code: 'BEB-002', qty: '0.080', unit: 'KG', isCost: true, notes: 'Azúcar al gusto' },
          { code: 'VER-005', qty: '0.020', unit: 'KG', isCost: false, notes: 'Limón exprimido' },
        ],
      },
    ];

    let recipesCreated = 0;
    let linesCreated = 0;
    for (const def of recipeDefs) {
      const productId = prodMap[def.productName];
      if (!productId) continue;
      const validLines = def.lines.filter((l) => iMap[l.code]);
      if (!validLines.length) continue;

      const [recipe] = await db.insert(s.recipes).values({
        productId,
        name: def.recipeName,
        servings: def.servings,
        yieldPct: '100',
        productionAreaId: kitchenAreaId ?? null,
        isActive: true,
      }).returning().onConflictDoNothing();

      if (!recipe) continue; // ya existía
      recipesCreated++;

      await db.insert(s.recipeLines).values(
        validLines.map((l) => ({
          recipeId: recipe.id,
          itemId: iMap[l.code],
          qty: l.qty,
          unit: l.unit,
          isCost: l.isCost,
          isOptional: l.isOptional ?? false,
          notes: l.notes ?? null,
        }))
      ).onConflictDoNothing();
      linesCreated += validLines.length;
    }
    log(`${recipesCreated} recetas con ${linesCreated} líneas de ingredientes`);

    // ── billing_series ──────────────────────────────────────────────────────
    section('billing_series');
    await db.insert(s.billingSeries).values([
      {
        documentType: 'factura',
        series: 'F001',
        priceInclTax: false,
        taxRate: '18',
        description: 'Factura estándar',
      },
      {
        documentType: 'boleta',
        series: 'B001',
        priceInclTax: true,
        taxRate: '18',
        description: 'Boleta de venta',
      },
      {
        documentType: 'nota_de_venta',
        series: 'NV01',
        priceInclTax: true,
        taxRate: '18',
        description: 'Nota de venta interna',
      },
    ]).onConflictDoNothing();
    log('3 series de facturación (F001, B001, NV01)');

    // ── users ────────────────────────────────────────────────────────────────
    section('users');
    const adminPassword = await Bun.password.hash('admin123', { algorithm: 'bcrypt', cost: 10 });
    const waiterPassword = await Bun.password.hash('mozo123', { algorithm: 'bcrypt', cost: 10 });
    const kitchenPassword = await Bun.password.hash('cocina123', { algorithm: 'bcrypt', cost: 10 });
    await db.insert(s.users).values([
      { username: 'admin', password: adminPassword, name: 'Administrador', role: 'admin' },
      { username: 'mozo1', password: waiterPassword, name: 'Mozo Demo', role: 'waiter' },
      { username: 'cocina', password: kitchenPassword, name: 'Cocinero Demo', role: 'kitchen' },
    ]).onConflictDoNothing();
    log('3 usuarios (admin / mozo1 / cocina)');

    // ── Done ─────────────────────────────────────────────────────────────────
    console.log('\n✅ Seed completado exitosamente!\n');
    console.log('  Credenciales creadas:');
    console.log('  ┌─────────────┬────────────┬──────────────┐');
    console.log('  │ Usuario     │ Contraseña │ Rol          │');
    console.log('  ├─────────────┼────────────┼──────────────┤');
    console.log('  │ admin       │ admin123   │ admin        │');
    console.log('  │ mozo1       │ mozo123    │ waiter       │');
    console.log('  │ cocina      │ cocina123  │ kitchen      │');
    console.log('  └─────────────┴────────────┴──────────────┘\n');

  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Error durante el seed:', err.message || err);
  process.exit(1);
});
