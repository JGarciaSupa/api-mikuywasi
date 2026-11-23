INSERT INTO "plan_feature_definitions" ("key", "label", "description", "value_type", "unit", "default_value", "display_order")
VALUES (
	'pedidoQr',
	'Pedido por QR',
	'Permite activar el pedido por QR en la mesa y la llamada al mozo.',
	'boolean',
	NULL,
	'false'::jsonb,
	20
)
ON CONFLICT ("key") DO NOTHING;
