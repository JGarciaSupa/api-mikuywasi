import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/tenant/schema.ts',
  out: './drizzle/tenant',
  dialect: 'postgresql'
});