/**
 * Public image URLs (Phase 3.6). Pure and client-safe — no file-system
 * access, so Server Components, theme components, and client forms can
 * all build the same URL from a stored object key.
 *
 * Images are served by `src/app/api/images/[...key]/route.ts` as
 * unguessable capability URLs: keys are server-generated random ids, so
 * no session is needed to view them (public sites render logos and item
 * photos to anonymous visitors).
 */
export function imageUrlForKey(key: string): string {
  return `/api/images/${key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}
