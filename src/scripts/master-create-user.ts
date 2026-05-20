import { createUser } from '../core/master/services/users.service';

/**
 * 📝 CONFIGURACIÓN DEL USUARIO
 * Modifica los campos de este objeto para crear el usuario que deseas.
 */
const NEW_USER_CONFIG = {
  name: 'Renato Navarro',
  userName: 'devrenatonavarro',
  email: null,
  password: '12345678',
  image: null
};

async function execute() {
  console.log('\n🚀 [SCRIPT] Iniciando creación de usuario en base de datos Master...\n');
  console.log('Datos configurados:');
  console.log(`- Nombre:      ${NEW_USER_CONFIG.name}`);
  console.log(`- Usuario:     ${NEW_USER_CONFIG.userName}`);
  console.log(`- Email:       ${NEW_USER_CONFIG.email || 'N/A'}`);
  console.log(`- Password:    ${'*'.repeat(NEW_USER_CONFIG.password.length)}`);
  console.log('--------------------------------------------------');

  try {
    const createdUser = await createUser(NEW_USER_CONFIG);
    console.log('\n✅ ¡Usuario creado con éxito!');
    console.log('Detalles del usuario creado (contraseña encriptada no se muestra):');
    console.log(JSON.stringify(createdUser, null, 2));
    console.log('\n🎉 Proceso terminado correctamente.\n');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error al crear el usuario:');
    console.error(error.message || error);
    console.log('\n⚠️ Asegúrate de que el nombre de usuario no esté repetido, cumpla con las validaciones (letras, números y guion bajo), y que la contraseña sea mayor a 8 caracteres.\n');
    process.exit(1);
  }
}

execute();
