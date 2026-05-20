import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/master/schema.ts',
  out: './drizzle/master',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
