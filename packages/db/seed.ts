import { seedThemes } from "./seed-themes";
import { seedTemplates } from "./seed-templates";

/**
 * Seeds the predefined theme library and the template catalog. Idempotent:
 * themes and templates use fixed UUIDs, so re-running safely no-ops on
 * already-inserted rows.
 *
 * Run with: pnpm run db:seed  (inside packages/db, with DATABASE_URL set)
 */
async function main() {
  await seedThemes();
  await seedTemplates();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});