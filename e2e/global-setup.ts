import type { FullConfig } from "@playwright/test";
import { seedOwnerJourney } from "./helpers";

/**
 * Global setup (Phase 3.9): reset the owner-journey tenant before the
 * suite runs so every run starts from the same draft state, no matter
 * how the previous run ended.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await seedOwnerJourney();
}
