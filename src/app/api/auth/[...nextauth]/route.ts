import { connection, type NextRequest } from "next/server";
import { handlers } from "@/auth";

/**
 * Auth responses depend on request cookies and the database, so this route
 * is always dynamic. `await connection()` is the `cacheComponents`
 * -compatible opt-out (the legacy `export const dynamic` is rejected):
 * without it, `next build` executes the handlers during page collection,
 * which needs a live database that CI does not have.
 */
export async function GET(req: NextRequest): Promise<Response> {
  await connection();
  return handlers.GET(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  await connection();
  return handlers.POST(req);
}
