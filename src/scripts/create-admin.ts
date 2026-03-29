import { db } from '../db';
import { users } from '../db/schema';
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

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    console.error('Error: Ya existe un usuario con este email.');
    process.exit(1);
  }

  const hashedPassword = await Bun.password.hash(password);

  await db.insert(users).values({
    email,
    password: hashedPassword,
    name,
    role: 'super-admin',
    // tenantId es null para super-admin (por el check constraint)
  });

  console.log(`✅ Super Admin creado con éxito: ${name} (${email})`);
  process.exit(0);
}

createAdmin().catch(err => {
  console.error('❌ Error al crear admin:', err);
  process.exit(1);
});
