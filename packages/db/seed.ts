import { seedThemes } from "./seed-themes";

/**
 * Seeds the predefined theme library. Idempotent: each theme uses a fixed
 * UUID, so re-running safely no-ops on already-inserted rows.
 *
 * Run with: pnpm run db:seed  (inside packages/db, with DATABASE_URL set)
 */
async function main() {
  await seedThemes();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});