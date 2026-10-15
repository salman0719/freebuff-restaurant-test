/**
 * Public image route (Phase 3.6). Serves stored uploads (logos, item
 * photos) to anonymous visitors — public sites render them without a
 * session, so this route is intentionally unauthenticated (the proxy only
 * gates `/dashboard` and `/operator`).
 *
 * Capability-URL security: keys are server-generated random ids that can
 * only be learned from a tenant's own pages. Segments are rejoined and
 * re-validated against the storage key allowlist before any disk access,
 * so traversal and non-image paths 404 instead of reading files. Keys are
 * unique per upload (replaces mint a new key), so immutable long caching
 * is safe — a replaced logo never serves stale bytes.
 */
import { getObject } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> }
): Promise<Response> {
  const { key } = await params;
  if (!Array.isArray(key) || key.length === 0) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  const object = await getObject(key.join("/"));
  if (!object) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return new Response(object.bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": object.mimeType,
      "Content-Length": String(object.bytes.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      // Defence in depth for user-uploaded bytes served from our origin
      // (6.1): the browser must take the declared type at face value and
      // must never treat a stored file as a document. Bytes are magic-byte
      // checked on upload; this is the layer that does not depend on that
      // check being perfect.
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
