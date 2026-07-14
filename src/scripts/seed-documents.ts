import 'dotenv/config';
import { masterDb } from '../db';
import { identityDocumentTypes, receiptTypes } from '../db/master/schema';

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
    console.log('✅ Tipos de comprobantes insertados.');
  } catch (error) {
    console.error('❌ Error al insertar documentos:', error);
  } finally {
    process.exit(0);
  }
}

seedDocuments();
