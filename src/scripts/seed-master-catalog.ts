import 'dotenv/config';
import { masterDb } from '../db';
import { countries, currencies } from '../db/master/schema';

// ─────────────────────────────────────────────────────────────
// SEED — Catálogos maestros mínimos que requiere SIGG US 1.2
// (País y Moneda son dependencias obligatorias del Local/Sucursal)
// ─────────────────────────────────────────────────────────────

const COUNTRIES = [
  { name: 'Perú', isoCode: 'PE' },
];

const CURRENCIES = [
  { name: 'Sol Peruano', isoCode: 'PEN', symbol: 'S/' },
  { name: 'Dólar Americano', isoCode: 'USD', symbol: '$' },
];

async function run() {
  console.log('\n🌎 [CATALOG SEED] Sembrando países y monedas base...\n');

  try {
    for (const country of COUNTRIES) {
      await masterDb.insert(countries).values(country).onConflictDoNothing({ target: countries.isoCode });
      console.log(`   País listo: ${country.name} (${country.isoCode})`);
    }

    for (const currency of CURRENCIES) {
      await masterDb.insert(currencies).values(currency).onConflictDoNothing({ target: currencies.isoCode });
      console.log(`   Moneda lista: ${currency.name} (${currency.isoCode})`);
    }

    console.log('\n✅ [CATALOG SEED] Completado.\n');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ [CATALOG SEED] Error:', error?.message || error);
    process.exit(1);
  }
}

run();
