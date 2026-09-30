/** Only a page on this site: "/x", never "//other.site" or "/\\other.site" (browsers treat "\\" like "/"). */
export function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "/";
  if (!/^\/(?![/\\])/.test(s) || /[\\\s]/.test(s)) return "/";
  try {
    return new URL(s, "http://x").origin === "http://x" ? s : "/";
  } catch {
    return "/";
  }
}
