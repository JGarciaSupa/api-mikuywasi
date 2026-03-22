import { db } from './index';
import { plans, superAdmins } from './schema';

async function seed() {
  console.log('Seeding database...');

  // Seed Plans
  const existingPlans = await db.select().from(plans);
  if (existingPlans.length === 0) {
    await db.insert(plans).values([
      {
        name: 'Plan Estándar',
        price: '300.00',
        oldPrice: '450.00',
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
          'Video Tutorial + Manual de uso',
          'Google Maps con la ubicación',
          'Soporte prioritario por 1 Mes',
          '*Renovación Anual: S/ 200'
        ],
        order: 1,
      },
      {
        name: 'Plan Avanzado',
        price: '490.00',
        oldPrice: '650.00',
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
          'Video Tutorial + Manual de uso',
          'Google Maps con la ubicación',
          'Soporte prioritario por 3 Meses',
          '*Renovación Anual: S/ 200'
        ],
        order: 2,
      },
      {
        name: 'Plan Premium',
        price: '650.00',
        oldPrice: '750.00',
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
          'Video Tutorial + Manual de uso',
          'Google Maps con la ubicación',
          'Soporte prioritario por 6 Meses',
          '*Renovación Anual: S/ 200'
        ],
        order: 3,
      },
    ]);
    console.log('Plans seeded!');
  }

  // Seed Super Admin
  const existingAdmins = await db.select().from(superAdmins);
  if (existingAdmins.length === 0) {
    await db.insert(superAdmins).values({
      email: 'admin@admin.com',
      password: 'admin', // In production use hashing!
      name: 'Super Admin',
    });
    console.log('Super Admin user seeded!');
  }

  console.log('Seeding completed.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
