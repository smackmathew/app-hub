/** An app's series color (a CSS variable, so light and dark each get their validated step). */
export const seriesColor = (slot: number) => `var(--s${((slot % 8) + 8) % 8})`;

/** The first palette slot no app is using yet, so a new app gets a distinct color. */
export function nextFreeSlot(used: number[]): number {
  for (let i = 0; i < 8; i++) if (!used.includes(i)) return i;
  return used.length % 8;
}
