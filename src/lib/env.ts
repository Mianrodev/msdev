/**
 * Database URL discovery.
 *
 * Vercel's Neon integration normally sets DATABASE_URL (older setups:
 * POSTGRES_URL), but a custom prefix chosen while connecting the database
 * produces names like STORAGE_DATABASE_URL or CRM_POSTGRES_URL. Accept any of
 * those, preferring the standard names.
 */
const PREFERRED = ["DATABASE_URL", "POSTGRES_URL", "POSTGRES_PRISMA_URL"];
const POOLED = /(^|_)(DATABASE_URL|POSTGRES_URL|POSTGRES_PRISMA_URL)$/;
const UNPOOLED = /(^|_)(DATABASE_URL_UNPOOLED|POSTGRES_URL_NON_POOLING)$/;

const isPg = (v: string | undefined): v is string => !!v && /^postgres(ql)?:\/\//.test(v);

function find(pattern: RegExp, preferred: string[] = []): string | undefined {
  for (const k of preferred) if (isPg(process.env[k])) return process.env[k];
  const key = Object.keys(process.env)
    .filter((k) => pattern.test(k) && isPg(process.env[k]))
    .sort()[0];
  return key ? process.env[key] : undefined;
}

/** Pooled connection URL for the app. */
export function databaseUrl(): string | undefined {
  return find(POOLED, PREFERRED);
}

/** Direct connection URL for migrations, when the provider offers one. */
export function directDatabaseUrl(): string | undefined {
  return find(UNPOOLED, ["DATABASE_URL_UNPOOLED", "POSTGRES_URL_NON_POOLING"]);
}

/** Hosted (Vercel) without a database connected yet. */
export function missingHostedDatabase(): boolean {
  return !!process.env.VERCEL && !databaseUrl();
}
