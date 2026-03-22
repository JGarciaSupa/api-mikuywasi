import { db } from './index';
import { plans } from './schema';

async function seedPlans() {
  console.log('Seeding plans...');

  await db.delete(plans); // Clear existing plans to start fresh

  await db.insert(plans).values([
    {
      name: 'Plan Estándar',
      monthlyPrice: '15.00',
      yearlyPrice: '150.00',
      features: [
        'Carga Inicial de 50 Platos/Bebidas',
        'Pedidos enviados a WhatsApp',
        'Ubicación Exacta del Cliente (GPS)',
        'Pedidos en Mesa + Delivery + Recogo',
        'Diseño de 1 Banner Promocional',
        'Enlaces a Todas las Redes Sociales',
        'Hosting + .COM: Gratis por 1 año',
        'Código QR personalizado',
        'Acceso, Soporte y Capacitación',
        '*Configuración de dominio propio (Plan anual)'
      ],
      order: 1,
    },
    {
      name: 'Plan Avanzado',
      monthlyPrice: '20.00',
      yearlyPrice: '200.00',
      features: [
        'Carga Inicial de 100 Platos/Bebidas',
        'Pedidos enviados a WhatsApp',
        'Ubicación Exacta del Cliente (GPS)',
        'Pedidos en Mesa + Delivery + Recogo',
        'Diseño de 2 Banners Promocionales',
        'Enlaces a Todas las Redes Sociales',
        'Hosting + .COM: Gratis por 1 año',
        'Código QR personalizado',
        'Acceso, Soporte y Capacitación',
        '*Configuración de dominio propio (Plan anual)'
      ],
      order: 2,
    },
    {
      name: 'Plan Premium',
      monthlyPrice: '25.00',
      yearlyPrice: '250.00',
      features: [
        'Carga Inicial de 200 Platos/Bebidas',
        'Pedidos enviados a WhatsApp',
        'Ubicación Exacta del Cliente (GPS)',
        'Pedidos en Mesa + Delivery + Recogo',
        'Diseño de 3 Banners Promocionales',
        'Enlaces a Todas las Redes Sociales',
        'Hosting + .COM: Gratis por 1 año',
        'Código QR personalizado',
        'Acceso, Soporte y Capacitación',
        '*Configuración de dominio propio (Plan anual)'
      ],
      order: 3,
    },
  ]);

  console.log('✅ Plans seeded successfully!');
  process.exit(0);
}

seedPlans().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
