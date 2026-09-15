import { db } from "./index";
import { themesTable, type ThemeBackground } from "./schema";

type SeedCategory =
  | "movies"
  | "anime"
  | "games"
  | "startups"
  | "tech"
  | "os"
  | "events"
  | "community";

interface SeedTheme {
  id: string;
  name: string;
  category: SeedCategory;
  font: string;
  colors: {
    primary: string;
    background: string;
    surface: string;
    text: string;
  };
  background?: ThemeBackground;
}

/**
 * Seeds the predefined theme library. Idempotent: each theme uses a fixed
 * UUID, so re-running safely no-ops on already-inserted rows.
 *
 * Run with: pnpm run db:seed  (inside packages/db, with DATABASE_URL set)
 */
const seeds: SeedTheme[] = [
  {
    id: "10000000-0000-4000-8000-000000000001",
    name: "Nebula Nights",
    category: "tech" as const,
    font: "Inter",
    colors: { primary: "#6366f1", background: "#0b0b0f", surface: "#16161c", text: "#f4f4f5" },
  },
  {
    id: "10000000-0000-4000-8000-000000000002",
    name: "Retro Arcade",
    category: "games" as const,
    font: "JetBrains Mono",
    colors: { primary: "#f59e0b", background: "#1b1030", surface: "#241743", text: "#ffe8c2" },
    background: { type: "gradient", from: "#1b1030", to: "#120a22" },
  },
  {
    id: "10000000-0000-4000-8000-000000000003",
    name: "Studio Noir",
    category: "movies" as const,
    font: "Lora",
    colors: { primary: "#ef4444", background: "#0a0a0a", surface: "#171717", text: "#fafafa" },
  },
  {
    id: "10000000-0000-4000-8000-000000000004",
    name: "Sakura Blossom",
    category: "anime" as const,
    font: "Poppins",
    colors: { primary: "#ec4899", background: "#2a1422", surface: "#3a1b2e", text: "#fdeef5" },
    background: { type: "gradient", from: "#2a1422", to: "#1d0d18" },
  },
  {
    id: "10000000-0000-4000-8000-000000000005",
    name: "Startup Sprint",
    category: "startups" as const,
    font: "Inter",
    colors: { primary: "#10b981", background: "#06120d", surface: "#0d1f16", text: "#eafaf2" },
  },
  {
    id: "10000000-0000-4000-8000-000000000006",
    name: "Terminal Green",
    category: "os" as const,
    font: "JetBrains Mono",
    colors: { primary: "#22c55e", background: "#0c0f0a", surface: "#161b12", text: "#e6ffe6" },
    background: { type: "gradient", from: "#0c0f0a", to: "#132114" },
  },
  {
    id: "10000000-0000-4000-8000-000000000007",
    name: "Neon Wave",
    category: "events" as const,
    font: "Space Grotesk",
    colors: { primary: "#d946ef", background: "#15061a", surface: "#23082c", text: "#fdf2ff" },
    background: { type: "gradient", from: "#15061a", to: "#0d0410" },
  },
  {
    id: "10000000-0000-4000-8000-000000000008",
    name: "Community Commons",
    category: "community" as const,
    font: "Raleway",
    colors: { primary: "#fb923c", background: "#14100b", surface: "#201a12", text: "#fff6ec" },
  },
  {
    id: "10000000-0000-4000-8000-000000000009",
    name: "Ocean Breeze",
    category: "community" as const,
    font: "Poppins",
    colors: { primary: "#0ea5e9", background: "#082430", surface: "#0e3140", text: "#e6f6ff" },
  },
  {
    id: "10000000-0000-4000-8000-00000000000a",
    name: "Golden Hour",
    category: "movies" as const,
    font: "Playfair Display",
    colors: { primary: "#eab308", background: "#1c1606", surface: "#29200a", text: "#fffbe6" },
  },
];

async function main() {
  for (const seed of seeds) {
    await db
      .insert(themesTable)
      .values({ ...seed, ownerId: null })
      .onConflictDoNothing({ target: themesTable.id })
      .execute();
  }
  const inserted = await db.select({ id: themesTable.id, name: themesTable.name }).from(themesTable).execute();
  console.log(`Seeded themes. Total in DB: ${inserted.length}`);
  console.log(inserted.map((t) => `  - ${t.name}`).join("\n"));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});