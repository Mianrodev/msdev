/** Simple 24×24 line icons (stroke = currentColor) for the site template. */
import type { IconName } from "./schema";

const PATHS: Record<IconName, string> = {
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  drop: '<path d="M12 2.7S6 9.3 6 14a6 6 0 0 0 12 0c0-4.7-6-11.3-6-11.3z"/>',
  flame: '<path d="M12 22a7 7 0 0 0 7-7c0-4-3-6-4-9-2 2-2 4-2 4s-2-1-3-4c-3 3-5 6-5 9a7 7 0 0 0 7 7z"/>',
  snowflake: '<path d="M12 2v20M4.9 6.9l14.2 10.2M19.1 6.9 4.9 17.1M9 4l3 2 3-2M9 20l3-2 3 2"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  leaf: '<path d="M5 21c0-9 5-15 16-16-1 11-7 16-16 16z"/><path d="M5 21 13 13"/>',
  hammer: '<path d="m14 7 3 3-9 9-3-3z"/><path d="m13 4 3-1 5 5-1 3-3-3z"/>',
  spray: '<path d="M8 8h6v13H8zM10 8V5h2v3M16 4h1M18 6h2M16 8h1M19 3h1"/>',
  truck: '<path d="M2 6h11v10H2zM13 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  dollar: '<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.1a4 4 0 0 1 0 7.8M22 21a7 7 0 0 0-5-6.7"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
};

export function icon(name: IconName, size = 24): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? PATHS.check}</svg>`;
}
