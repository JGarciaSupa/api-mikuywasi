import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';
import type { UserRole } from '../constants/user-roles';

const NEW_ADMIN = {
  email: 'devrenatonavarro@gmail.com',
  password: '12345678',
  name: 'Renato Navarro',
  role: 'super-admin'
} as {
  email: string;
  password: string;
  name: string;
  role: UserRole;
};

async function createAdmin() {
  const { email, password, name, role } = NEW_ADMIN;
  
  if (!email || !password || !name || !role) {
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

  const hashedPassword = await Bun.password.hash(password, 'bcrypt');

  await db.insert(users).values({
    email,
    password: hashedPassword,
    name,
    role
  });

  console.log(`✅ Super Admin creado con éxito: ${name} (${email})`);
  process.exit(0);
}

createAdmin().catch(err => {
  console.error('❌ Error al crear admin:', err);
  process.exit(1);
});
