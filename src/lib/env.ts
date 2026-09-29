/** Pooled database URL. Vercel's Neon integration sets DATABASE_URL (older setups: POSTGRES_URL). */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

/** Hosted (Vercel) without a database connected yet. */
export function missingHostedDatabase(): boolean {
  return !!process.env.VERCEL && !databaseUrl();
}
