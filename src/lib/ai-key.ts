/**
 * The private link that lets the owner's own AI (e.g. Claude, as a custom
 * connector) read leads and save prepared material. The link contains a long
 * random key; only its SHA-256 is stored, so the link is shown once. Making a
 * new link or switching it off stops the old one immediately.
 */
import { and, eq } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";
import { DEFAULT_WORKSPACE_ID, ensureWorkspace } from "@/services/context";

const KEY = "auth.aiLink";

interface Stored {
  hash: string;
  createdAt: string;
}

const sha = (s: string) => createHash("sha256").update(s).digest();

async function read(db: Db): Promise<Stored | null> {
  const [row] = await db
    .select()
    .from(settings)
    .where(and(eq(settings.workspaceId, DEFAULT_WORKSPACE_ID), eq(settings.key, KEY)))
    .limit(1);
  const v = row?.value as Partial<Stored> | undefined;
  return v && typeof v.hash === "string" && v.hash ? { hash: v.hash, createdAt: String(v.createdAt ?? "") } : null;
}

async function write(db: Db, value: Stored | Record<string, never>) {
  await ensureWorkspace(db);
  await db
    .insert(settings)
    .values({ workspaceId: DEFAULT_WORKSPACE_ID, key: KEY, value })
    .onConflictDoUpdate({ target: [settings.workspaceId, settings.key], set: { value, updatedAt: new Date().toISOString() } });
}

export async function aiLinkStatus(db: Db): Promise<{ on: boolean; createdAt: string | null }> {
  const s = await read(db);
  return { on: !!s, createdAt: s?.createdAt || null };
}

/** Make a new key (replacing any old one). Returns the key, for showing once. */
export async function newAiKey(db: Db): Promise<string> {
  const key = randomBytes(24).toString("base64url");
  await write(db, { hash: sha(key).toString("hex"), createdAt: new Date().toISOString() });
  return key;
}

export async function removeAiKey(db: Db): Promise<void> {
  await write(db, {});
}

export async function aiKeyValid(db: Db, key: string | undefined): Promise<boolean> {
  if (!key || key.length < 20) return false;
  const s = await read(db);
  if (!s) return false;
  const want = Buffer.from(s.hash, "hex");
  const got = sha(key);
  return want.length === got.length && timingSafeEqual(want, got);
}
