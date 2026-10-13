"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isModuleId, type ModuleId } from "@/core/opportunities/types";
import { toRaw } from "@/core/opportunities/query";
import { PermissionError } from "@/core/permissions";
import { safeNext } from "@/lib/safe-next";
import { addNote, addToList, createList, NotFoundError, removeFromList, requestAiSummary, saveItem, setStatus, unsaveItem } from "@/services/opportunities/items";
import { saveProfile } from "@/services/opportunities/profile";
import { runSearch, SearchInputError } from "@/services/opportunities/search";
import { UsageLimitError } from "@/services/opportunities/usage";
import { getCtx } from "@/services/request";
import { ZodError } from "zod";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" ? v : "";
};

function withMessage(path: string, key: "ok" | "error", msg: string) {
  const u = new URL(path, "http://x");
  u.searchParams.set(key, msg.slice(0, 400));
  return `${u.pathname}${u.search}`;
}

function friendly(e: unknown): string {
  if (e instanceof SearchInputError || e instanceof UsageLimitError) return e.message;
  if (e instanceof NotFoundError) return "That item isn't in your workspace (it may have been removed). Refresh and try again.";
  if (e instanceof PermissionError) return "That action isn't allowed for this account.";
  if (e instanceof ZodError) return `Please check the form: ${e.issues[0]?.path.join(".")} — ${e.issues[0]?.message}`;
  const msg = e instanceof Error ? e.message : String(e);
  return /^[A-Z].{3,240}$/.test(msg) ? msg : "Something went wrong. Nothing was lost — please try again.";
}

async function act(back: string, fn: () => Promise<string | void>) {
  let target: string;
  try {
    const r = await fn();
    revalidatePath("/opportunities", "layout");
    target = withMessage(back, "ok", typeof r === "string" ? r : "Saved");
  } catch (e) {
    target = withMessage(back, "error", friendly(e));
  }
  redirect(target);
}

function moduleFrom(v: string): ModuleId {
  if (!isModuleId(v)) throw new Error("Unknown module");
  return v;
}

export async function searchAction(module: string, f: FormData) {
  const m = moduleFrom(module);
  const view = str(f, "view") === "table" ? "&view=table" : "";
  let target: string;
  try {
    const out = await runSearch(await getCtx(), m, toRaw(f));
    target = `/opportunities/${m}?search=${out.searchId}${view}`;
  } catch (e) {
    target = withMessage(`/opportunities/${m}`, "error", friendly(e));
  }
  redirect(target);
}

export async function saveAction(id: string, f: FormData) {
  await act(safeNext(f.get("back")), async () => {
    const r = await saveItem(await getCtx(), id, str(f, "status") || undefined);
    return `Saved “${r.title.slice(0, 80)}”`;
  });
}

export async function unsaveAction(id: string, f: FormData) {
  await act(safeNext(f.get("back")), async () => {
    await unsaveItem(await getCtx(), id);
    return "Removed from saved items";
  });
}

export async function statusAction(id: string, f: FormData) {
  await act(safeNext(f.get("back")), async () => {
    const r = await setStatus(await getCtx(), id, str(f, "status"));
    return `Status set: ${r.status}`;
  });
}

export async function noteAction(id: string, f: FormData) {
  await act(safeNext(f.get("back")), async () => {
    await addNote(await getCtx(), id, str(f, "note"));
    return "Note added";
  });
}

export async function createListAction(module: string, f: FormData) {
  await act(safeNext(f.get("back")), async () => {
    const ctx = await getCtx();
    const list = await createList(ctx, moduleFrom(module), str(f, "name"));
    const itemId = str(f, "itemId");
    if (itemId) await addToList(ctx, list.id, itemId);
    return itemId ? `Added to new list “${list.name}”` : `List “${list.name}” created`;
  });
}

export async function addToListAction(f: FormData) {
  await act(safeNext(f.get("back")), async () => {
    await addToList(await getCtx(), str(f, "listId"), str(f, "itemId"));
    return "Added to list";
  });
}

export async function removeFromListAction(f: FormData) {
  await act(safeNext(f.get("back")), async () => {
    await removeFromList(await getCtx(), str(f, "listId"), str(f, "itemId"));
    return "Removed from list";
  });
}

export async function profileAction(f: FormData) {
  await act("/opportunities/profile", async () => {
    await saveProfile(await getCtx(), toRaw(f));
    return "Company profile saved — new searches use it for matching";
  });
}

export async function aiSummaryAction(id: string, f: FormData) {
  await act(safeNext(f.get("back")), async () => {
    await requestAiSummary(await getCtx(), id);
    return "AI summary added (labelled as AI — check it against the published text)";
  });
}
