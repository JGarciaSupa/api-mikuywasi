import 'dotenv/config';
import { masterDb } from '../db';
import { salesChannelClassifications } from '../db/master/schema';

const classificationsData = [
  {
    code: 'dine_in',
    group: 'on_premise',
    name: 'Comer en Local',
    description: 'Servicio clásico en mesa, barra o terraza.',
    isActive: true,
  },
  {
    code: 'pickup',
    group: 'on_premise',
    name: 'Para Llevar / Recojo en Tienda',
    description: 'El cliente pide de forma presencial o remota y retira en el establecimiento.',
    isActive: true,
  },
  {
    code: 'drive_thru',
    group: 'on_premise',
    name: 'Auto-Servicio / Auto-Mac',
    description: 'El cliente pide y recibe su orden desde su vehículo.',
    isActive: true,
  },
  {
    code: 'kiosk',
    group: 'on_premise',
    name: 'Kiosko Auto-atención',
    description: 'Venta directa en local sin interacción directa con cajero.',
    isActive: true,
  },
  {
    code: 'direct_delivery',
    group: 'off_premise',
    name: 'Delivery Propio',
    description: 'Pedidos por teléfono, WhatsApp o web/app propia con repartidores del restaurante.',
    isActive: true,
  },
  {
    code: 'aggregator_delivery',
    group: 'off_premise',
    name: 'Delivery por Aggregators',
    description: 'Pedidos provenientes de plataformas como Rappi, PedidosYa, UberEats, Just Eat, etc.',
    isActive: true,
  },
  {
    code: 'catering',
    group: 'b2b',
    name: 'Catering y Banquetes',
    description: 'Venta de servicios para eventos privados, corporativos o mantención de comedores.',
    isActive: true,
  },
  {
    code: 'corporate',
    group: 'b2b',
    name: 'Venta Institucional / Corporativa',
    description: 'Convenios con empresas para atención recurrente o vales de consumo.',
    isActive: true,
  },
  {
    code: 'dark_kitchen',
    group: 'digital',
    name: 'Cocinas Ocultas',
    description: 'Marcas virtuales enfocadas 100% en delivery.',
    isActive: true,
  },
  {
    code: 'room_service',
    group: 'digital',
    name: 'Habitación / Room Service',
    description: 'Específico del sector hotelero dentro de HORECA.',
    isActive: true,
  }
];

async function seedSalesChannelClassifications() {
  console.log('🌱 Iniciando seeder de Clasificaciones de Canales de Venta...');
  try {
    for (const cls of classificationsData) {
      await masterDb
        .insert(salesChannelClassifications)
        .values(cls)
        .onConflictDoUpdate({
          target: salesChannelClassifications.code,
          set: {
            name: cls.name,
            group: cls.group,
            description: cls.description,
            isActive: cls.isActive,
          },
        });
    }
    console.log('✅ Clasificaciones de Canales de Venta insertadas exitosamente.');
  } catch (error) {
    console.error('❌ Error al insertar clasificaciones:', error);
  } finally {
    process.exit(0);
  }
}

seedSalesChannelClassifications();
