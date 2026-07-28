import 'dotenv/config';
import { masterDb } from '../db';
import { tableStatuses } from '../db/master/schema';

const statusesData = [
  {
    code: 'available',
    name: 'Disponible',
    description: 'Mesa vacía, limpia y lista para sentar nuevos comensales.',
    colorHex: '#10B981',
    bgColorClass: 'bg-emerald-500',
    displayOrder: 1,
    isOperational: true,
    isActive: true,
  },
  {
    code: 'seated',
    name: 'Sentados (Menú)',
    description: 'Comensales en mesa leyendo la carta; aún sin pedir en cocina.',
    colorHex: '#F59E0B',
    bgColorClass: 'bg-amber-500',
    displayOrder: 2,
    isOperational: true,
    isActive: true,
  },
  {
    code: 'in_kitchen',
    name: 'En Cocina',
    description: 'Pedido tomado y enviado a cocina o bar; esperando alimentos.',
    colorHex: '#3B82F6',
    bgColorClass: 'bg-blue-500',
    displayOrder: 3,
    isOperational: true,
    isActive: true,
  },
  {
    code: 'served',
    name: 'Servida',
    description: 'Platos entregados; los comensales están consumiendo / en sobremesa.',
    colorHex: '#8B5CF6',
    bgColorClass: 'bg-purple-500',
    displayOrder: 4,
    isOperational: true,
    isActive: true,
  },
  {
    code: 'payment_pending',
    name: 'Por Pagar',
    description: 'Cuenta solicitada o pre-cuenta emitida. Listo para caja.',
    colorHex: '#F97316',
    bgColorClass: 'bg-orange-500',
    displayOrder: 5,
    isOperational: true,
    isActive: true,
  },
  {
    code: 'dirty',
    name: 'Por Limpiar',
    description: 'Cuenta pagada y cliente retirado; espera limpieza y montaje.',
    colorHex: '#EF4444',
    bgColorClass: 'bg-rose-500',
    displayOrder: 6,
    isOperational: true,
    isActive: true,
  },
  {
    code: 'reserved',
    name: 'Reservada',
    description: 'Asignada a una reserva confirmada para el servicio actual.',
    colorHex: '#14B8A6',
    bgColorClass: 'bg-teal-500',
    displayOrder: 7,
    isOperational: false,
    isActive: true,
  },
  {
    code: 'disabled',
    name: 'Fuera de Servicio',
    description: 'Bloqueada por mantenimiento, rotura o evento corporativo.',
    colorHex: '#64748B',
    bgColorClass: 'bg-slate-500',
    displayOrder: 8,
    isOperational: false,
    isActive: true,
  },
];

async function seedTableStatuses() {
  console.log('🌱 Iniciando seeder de Estados de Mesas...');
  try {
    for (const status of statusesData) {
      await masterDb
        .insert(tableStatuses)
        .values(status)
        .onConflictDoUpdate({
          target: tableStatuses.code,
          set: {
            name: status.name,
            description: status.description,
            colorHex: status.colorHex,
            bgColorClass: status.bgColorClass,
            displayOrder: status.displayOrder,
            isOperational: status.isOperational,
            isActive: status.isActive,
          },
        });
    }
    console.log('✅ Estados de Mesas insertados o actualizados exitosamente.');
  } catch (error) {
    console.error('❌ Error al insertar estados de mesas:', error);
  } finally {
    process.exit(0);
  }
}

seedTableStatuses();
