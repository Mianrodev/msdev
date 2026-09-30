/**
 * The private link that lets a person's own AI (e.g. Claude, as a custom
 * connector) read their workspace's leads and save prepared material. The link
 * contains a long random key; only its SHA-256 is stored (in that workspace's
 * settings), so the link is shown once. Making a new link or switching it off
 * stops the old one immediately.
 */
import { and, eq, sql } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";

const KEY = "auth.aiLink";

interface Stored {
  hash: string;
  createdAt: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

async function read(db: Db, workspaceId: string): Promise<Stored | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.workspaceId, workspaceId), eq(settings.key, KEY)))
    .limit(1);
  const v = row?.value as Partial<Stored> | undefined;
  return v && typeof v.hash === "string" && v.hash ? { hash: v.hash, createdAt: String(v.createdAt ?? "") } : null;
}

async function write(db: Db, workspaceId: string, value: Stored | Record<string, never>) {
  await db
    .insert(settings)
    .values({ workspaceId, key: KEY, value })
    .onConflictDoUpdate({ target: [settings.workspaceId, settings.key], set: { value, updatedAt: new Date().toISOString() } });
}

export async function aiLinkStatus(db: Db, workspaceId: string): Promise<{ on: boolean; createdAt: string | null }> {
  const s = await read(db, workspaceId);
  return { on: !!s, createdAt: s?.createdAt || null };
}

/** Make a new key (replacing any old one). Returns the key, for showing once. */
export async function newAiKey(db: Db, workspaceId: string): Promise<string> {
  const key = randomBytes(24).toString("base64url");
  await write(db, workspaceId, { hash: sha(key).toString("hex"), createdAt: new Date().toISOString() });
  return key;
}

export async function removeAiKey(db: Db, workspaceId: string): Promise<void> {
  if (await read(db, workspaceId)) await write(db, workspaceId, {});
}

/** The workspace a key opens — or null if the key is wrong, replaced or switched off. */
export async function aiKeyWorkspace(db: Db, key: string | undefined): Promise<string | null> {
  if (!key || key.length < 20) return null;
  const got = sha(key);
  const [row] = await db
    .select({ workspaceId: settings.workspaceId, value: settings.value })
    .from(settings)
    .where(and(eq(settings.key, KEY), sql`${settings.value}->>'hash' = ${got.toString("hex")}`))
    .limit(1);
  const want = Buffer.from(String((row?.value as Stored | undefined)?.hash ?? ""), "hex");
  return row && want.length === got.length && timingSafeEqual(want, got) ? row.workspaceId : null;
}
