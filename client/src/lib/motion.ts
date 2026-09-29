/** How long a paragraph flashes after its violation is clicked. Keep in sync with `--animate-flash` in styles.css. */
export const FLASH_MS = 1500;

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
