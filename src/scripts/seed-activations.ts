import 'dotenv/config';
import { masterDb } from '../db';
import { activations } from '../db/master/schema';

const activationsData = [
	{
		id: 1,
		code: "ORDER_PRODUCT_DELETE_REASON_CATALOG",
		name: "Usar listado de motivos al eliminar un producto del pedido",
		description: "Al eliminar un producto del pedido, el usuario deberá seleccionar un motivo del listado configurado. Si está desactivado, podrá ingresar un motivo libre.",
		category: "Pedidos",
		defaultEnabled: false,
		order: 1,
		isActive: true,
		module: "caja_chica"
	},
	{
		id: 2,
		code: "ORDER_DELETE_REASON_CATALOG",
		name: "Usar listado de motivos al eliminar un pedido",
		description: "Al eliminar un pedido, el usuario deberá seleccionar un motivo del listado configurado. Si está desactivado, podrá ingresar un motivo libre.",
		category: "Pedidos",
		defaultEnabled: false,
		order: 2,
		isActive: true,
		module: "caja_chica"
	},
	{
		id: 3,
		code: "ENABLE_ORDER_TRANSFER",
		name: "Activar transferencias (importar pedidos)",
		description: "Permite importar pedidos mediante el proceso de transferencias.",
		category: "Pedidos",
		defaultEnabled: false,
		order: 3,
		isActive: true,
		module: "caja_chica"
	},
	{
		id: 4,
		code: "ALLOW_CHANGE_ORDER_TYPE",
		name: "Permitir modificar el tipo de pedido",
		description: "Permite cambiar el tipo de pedido durante su gestión.",
		category: "Pedidos",
		defaultEnabled: false,
		order: 4,
		isActive: true,
		module: "caja_chica"
	},
	{
		id: 5,
		code: "ALLOW_SPLIT_PRODUCT",
		name: "Permitir desglosar productos en dos partes",
		description: "Permite dividir un producto en dos partes al registrarlo en un pedido.",
		category: "Pedidos",
		defaultEnabled: false,
		order: 5,
		isActive: true,
		module: "caja_chica"
	},
	{
		id: 14,
		code: "ENABLE_TABLE_MOVE",
		name: "Mover pedidos entre mesas",
		description: "Permite mover un pedido completo o productos seleccionados de una mesa a otra (fusiona si la mesa destino ya tiene pedido).",
		category: "Pedidos",
		defaultEnabled: false,
		order: 6,
		isActive: true,
		module: "caja_chica"
	},
	{
		id: 6,
		code: "PASSWORD_DELETE_ORDER",
		name: "Solicitar contraseña para eliminar pedidos",
		description: "Requiere una contraseña para eliminar un pedido.",
		category: "Seguridad",
		defaultEnabled: false,
		order: 1,
		isActive: true,
		module: "caja_chica"
	},
	{
		id: 7,
		code: "PASSWORD_DELETE_PRODUCT",
		name: "Solicitar contraseña para eliminar productos",
		description: "Requiere una contraseña para eliminar un producto de un pedido.",
		category: "Seguridad",
		defaultEnabled: false,
		order: 2,
		isActive: true,
		module: "caja_chica"
	},
	{
		id: 8,
		code: "password_close_shift",
		name: "Solicitar contraseña al cerrar el turno",
		description: "Requiere una contraseña para realizar el cierre de turno.",
		category: "Seguridad",
		defaultEnabled: false,
		order: 3,
		isActive: true,
		module: "caja_chica"
	},
	{
		id: 9,
		code: "print_prebill_footer_image",
		name: "Imprimir imagen en el pie de la precuenta",
		description: "Imprime el logotipo o imagen configurada en el pie de la precuenta.",
		category: "Precuentas",
		defaultEnabled: false,
		order: 3,
		isActive: true,
		module: "impresion"
	},
	{
		id: 10,
		code: "PRINT_CUSTOMER_HEADER",
		name: "Imprimir datos del cliente en la cabecera del documento",
		description: "Incluye los datos del cliente en la cabecera del documento impreso.",
		category: "Documentos",
		defaultEnabled: false,
		order: 5,
		isActive: true,
		module: "impresion"
	},
	{
		id: 13,
		code: "PRINT_DISCOUNT_REASON",
		name: "Imprimir motivo del descuento en los documentos",
		description: "Muestra el motivo del descuento en los documentos impresos.",
		category: "Documentos",
		defaultEnabled: false,
		order: 0,
		isActive: true,
		module: "impresion"
	},
	{
		id: 11,
		code: "PRINT_PREBILL_NOTES",
		name: "Imprimir observaciones en la precuenta",
		description: "Incluye las observaciones del pedido en la impresión de la precuenta.",
		category: "Precuentas",
		defaultEnabled: false,
		order: 1,
		isActive: true,
		module: "impresion"
	},
	{
		id: 12,
		code: "PRINT_PREBILL_HEADER_IMAGE",
		name: "Imprimir imagen en la cabecera de la precuenta",
		description: null,
		category: "Precuentas",
		defaultEnabled: false,
		order: 2,
		isActive: true,
		module: "impresion"
	},
	{
		id: 13,
		code: "print_valued_courtesies",
		name: "Imprimir cortesías valorizadas",
		description: "Muestra el valor económico de las cortesías en los documentos impresos.",
		category: "Otros documentos",
		defaultEnabled: false,
		order: 6,
		isActive: true,
		module: "impresion"
	}
];

async function seedActivations() {
	console.log('🌱 Iniciando seeder de Activaciones...');
	try {
		for (const act of activationsData) {
			await masterDb
				.insert(activations)
				.values(act)
				.onConflictDoUpdate({
					target: activations.code,
					set: {
						name: act.name,
						description: act.description,
						module: act.module,
						category: act.category,
						defaultEnabled: act.defaultEnabled,
						order: act.order,
						isActive: act.isActive,
					},
				});
		}
		console.log('✅ Activaciones insertadas exitosamente.');
	} catch (error) {
		console.error('❌ Error al insertar activaciones:', error);
	} finally {
		process.exit(0);
	}
}

seedActivations();
