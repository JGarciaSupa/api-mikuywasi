import { db } from './index';
import { superAdmins } from './schema';
import { eq } from 'drizzle-orm';

// CONFIGURATION: Modifica este objeto con los datos del admin que deseas crear
const NEW_ADMIN = {
  email: 'admin@gmail.com',
  password: '12345678',
  name: 'Super Admin'
};

async function createAdmin() {
  const { email, password, name } = NEW_ADMIN;
  
  if (!email || !password || !name) {
    console.error('Error: Debes completar todos los campos en el objeto NEW_ADMIN.');
    process.exit(1);
  }

  const existing = await db.query.superAdmins.findFirst({
    where: eq(superAdmins.email, email),
  });

  if (existing) {
    console.error('Error: Ya existe un usuario con este email.');
    process.exit(1);
  }

  await db.insert(superAdmins).values({
    email,
    password,
    name,
  });

  console.log(`✅ Super Admin creado con éxito: ${name} (${email})`);
  process.exit(0);
}

createAdmin().catch(err => {
  console.error('❌ Error al crear admin:', err);
  process.exit(1);
});
