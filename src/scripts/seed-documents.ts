import 'dotenv/config';
import { masterDb } from '../db';
import { identityDocumentTypes, receiptTypes } from '../db/master/schema';
import { and, eq, isNull } from 'drizzle-orm';

const identityDocsData = [
  {
    countryId: 179,
    code: '1',
    name: 'DNI',
    description: 'DNI',
    isActive: true,
    validationType: 'external_lookup' as const,
    docLength: 8,
    docPattern: null,
  },
  {
    countryId: 179,
    code: '6',
    name: 'RUC',
    description: 'Registro Único de Contribuyentes',
    isActive: true,
    validationType: 'external_lookup' as const,
    docLength: 11,
    docPattern: null,
  },
  {
    countryId: 179,
    code: '4',
    name: 'CE',
    description: 'Carnet de Extranjería',
    isActive: true,
    validationType: 'manual' as const,
    docLength: null,
    docPattern: null,
  },
];

const receiptDocsData = [
  {
    countryId: 179,
    code: '01',
    name: 'Factura',
    description: 'Factura',
    isActive: true,
  },
  {
    countryId: 179,
    code: '03',
    name: 'Boleta',
    description: 'Boleta de Venta Electrónica',
    isActive: true,
  },
  {
    countryId: 179,
    code: '07',
    name: 'Nota de Crédito',
    description: 'Nota de Crédito Electrónica',
    isActive: true,
  },
];

// Comprobantes globales (sin país): documentos internos que no se envían a SUNAT.
// 'INTERNO' es el código que ya usan las cajas de los tenants; si existe no se modifica.
const globalReceiptDocsData = [
  {
    code: 'INTERNO',
    name: 'Documento interno',
    description: 'Cuenta interna / nota de venta (no se envía a SUNAT)',
    isActive: true,
  },
];

async function seedDocuments() {
  console.log('🌱 Iniciando seed de documentos de identidad y comprobantes...');
  try {
    for (const doc of identityDocsData) {
      await masterDb
        .insert(identityDocumentTypes)
        .values(doc)
        .onConflictDoUpdate({
          target: [identityDocumentTypes.countryId, identityDocumentTypes.code],
          set: {
            name: doc.name,
            description: doc.description,
            isActive: doc.isActive,
            validationType: doc.validationType,
            docLength: doc.docLength,
            docPattern: doc.docPattern,
          },
        });
    }
    console.log('✅ Tipos de documentos de identidad insertados.');

    for (const receipt of receiptDocsData) {
      await masterDb
        .insert(receiptTypes)
        .values(receipt)
        .onConflictDoUpdate({
          target: [receiptTypes.countryId, receiptTypes.code],
          set: {
            name: receipt.name,
            description: receipt.description,
            isActive: receipt.isActive,
          },
        });
    }
    // countryId NULL no dispara el ON CONFLICT (NULL no se compara como igual): se busca antes.
    for (const receipt of globalReceiptDocsData) {
      const [existing] = await masterDb
        .select({ id: receiptTypes.id })
        .from(receiptTypes)
        .where(and(isNull(receiptTypes.countryId), eq(receiptTypes.code, receipt.code)));
      // Si ya existe (p. ej. editado desde el super admin) se respeta tal cual
      if (!existing) {
        await masterDb.insert(receiptTypes).values({ ...receipt, countryId: null, isGlobal: true });
      }
    }
    console.log('✅ Tipos de comprobantes insertados.');
  } catch (error) {
    console.error('❌ Error al insertar documentos:', error);
  } finally {
    process.exit(0);
  }
}

seedDocuments();
