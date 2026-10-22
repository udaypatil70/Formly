import { db } from "./index";
import { themesTable, type ThemeBackground } from "./schema";

export type SeedCategory =
  | "movies"
  | "anime"
  | "games"
  | "startups"
  | "tech"
  | "os"
  | "events"
  | "community";

export interface SeedTheme {
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
 * The predefined theme library. Each theme uses a fixed UUID so seeding is
 * idempotent (re-running safely no-ops on already-inserted rows).
 */
const initialSeeds: SeedTheme[] = [
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

const additionalThemePresets: Array<
  [string, SeedCategory, string, string, string, string, string]
> = [
  ["Aurora Bloom", "community", "Poppins", "#a78bfa", "#171126", "#251b38", "#f5f0ff"],
  ["Citrus Pop", "startups", "Inter", "#f97316", "#21130b", "#352014", "#fff4e8"],
  ["Blueprint Lab", "tech", "JetBrains Mono", "#38bdf8", "#071827", "#10283c", "#e0f2fe"],
  ["Paper & Ink", "movies", "Lora", "#b45309", "#f4efe6", "#fffaf0", "#292524"],
  ["Mint Condition", "community", "Raleway", "#34d399", "#092019", "#123329", "#eafff6"],
  ["Violet Velvet", "events", "Playfair Display", "#c084fc", "#1a1024", "#291936", "#faefff"],
  ["Solar Flare", "games", "Space Grotesk", "#fb7185", "#240d18", "#371323", "#fff1f2"],
  ["Quiet Forest", "community", "Lora", "#84cc16", "#10180d", "#1c2916", "#f2fce8"],
  ["Digital Dawn", "tech", "Inter", "#818cf8", "#101326", "#1a2040", "#eef2ff"],
  ["Coral Coast", "events", "Poppins", "#fb7185", "#241018", "#351923", "#fff1f2"],
  ["Mono Studio", "os", "JetBrains Mono", "#d4d4d8", "#101012", "#202024", "#fafafa"],
  ["Peach Fuzz", "community", "Raleway", "#fb923c", "#241610", "#382319", "#fff7ed"],
  ["Arctic Signal", "tech", "Inter", "#22d3ee", "#071a20", "#102b34", "#ecfeff"],
  ["Lavender Haze", "anime", "Poppins", "#e879f9", "#211329", "#33203d", "#fdf4ff"],
  ["Autumn Ledger", "startups", "Lora", "#c2410c", "#21150f", "#322117", "#fff7ed"],
  ["Deep Current", "community", "Space Grotesk", "#2dd4bf", "#071b1c", "#102d2e", "#e6fffb"],
  ["Ruby Cinema", "movies", "Playfair Display", "#f43f5e", "#1e0c12", "#32131e", "#fff1f2"],
  ["Pixel Garden", "games", "JetBrains Mono", "#a3e635", "#151b0b", "#252f12", "#f7fee7"],
  ["Soft Focus", "movies", "Lora", "#a78bfa", "#17151e", "#262330", "#f5f3ff"],
  ["Golden Gallery", "events", "Playfair Display", "#facc15", "#201b0a", "#332b10", "#fefce8"],
  ["Midnight Orchid", "anime", "Poppins", "#d946ef", "#1d0d20", "#311638", "#fdf4ff"],
  ["Alpine Air", "community", "Inter", "#60a5fa", "#0d1724", "#17283b", "#eff6ff"],
  ["Signal Orange", "tech", "Space Grotesk", "#fb923c", "#20130b", "#332014", "#fff7ed"],
  ["Sage & Stone", "startups", "Raleway", "#a3a38b", "#171812", "#28291f", "#f5f5eb"],
  ["Cosmic Dust", "games", "Space Grotesk", "#a855f7", "#170d25", "#29163d", "#faf5ff"],
  ["Koi Pond", "anime", "Poppins", "#f97316", "#1f100b", "#351b12", "#fff7ed"],
  ["Rainy Window", "movies", "Lora", "#7dd3fc", "#101a22", "#1b2a35", "#f0f9ff"],
  ["Festival Lights", "events", "Raleway", "#f472b6", "#210f20", "#361a34", "#fdf2f8"],
  ["Clean Slate", "startups", "Inter", "#64748b", "#111827", "#1f2937", "#f8fafc"],
  ["Emerald Archive", "community", "Lora", "#10b981", "#071b15", "#123126", "#ecfdf5"],
  ["Retro Sunset", "games", "JetBrains Mono", "#f97316", "#24120e", "#3a1f18", "#fff7ed"],
  ["Monsoon Blue", "community", "Poppins", "#3b82f6", "#0b1426", "#152441", "#eff6ff"],
  ["Rose Quartz", "anime", "Raleway", "#fb7185", "#211116", "#361b24", "#fff1f2"],
  ["Carbon Fiber", "tech", "JetBrains Mono", "#a1a1aa", "#0e0e10", "#1b1b1f", "#f4f4f5"],
  ["Lemonade Stand", "startups", "Inter", "#eab308", "#201d0b", "#353012", "#fefce8"],
  ["Blue Hour", "movies", "Playfair Display", "#60a5fa", "#0e1423", "#1a243a", "#eff6ff"],
  ["Wildflower Field", "community", "Poppins", "#c084fc", "#1b1220", "#2e1f36", "#faf5ff"],
  ["Copper Circuit", "tech", "Space Grotesk", "#f97316", "#1f130e", "#332118", "#fff7ed"],
  ["Starlit Stage", "events", "Inter", "#818cf8", "#111127", "#202044", "#eef2ff"],
  ["Bamboo Grove", "community", "Raleway", "#65a30d", "#111a0c", "#1f2c16", "#f7fee7"],
  ["Ice Cream Social", "events", "Poppins", "#f472b6", "#201321", "#352039", "#fdf4ff"],
  ["Obsidian Gold", "movies", "Playfair Display", "#fbbf24", "#14120c", "#282317", "#fffbeb"],
  ["Tidal Pool", "community", "Space Grotesk", "#06b6d4", "#07191f", "#102b34", "#ecfeff"],
  ["Manga Panel", "anime", "JetBrains Mono", "#f43f5e", "#1d1015", "#321821", "#fff1f2"],
  ["Cloud Nine", "startups", "Inter", "#38bdf8", "#0d1824", "#192b3b", "#f0f9ff"],
  ["Firefly Meadow", "games", "Raleway", "#facc15", "#19190d", "#2b2b16", "#fefce8"],
  ["Velvet Stage", "events", "Lora", "#e879f9", "#1c1020", "#321c38", "#fdf4ff"],
  ["Warm Minimal", "startups", "Inter", "#d97706", "#21180e", "#332819", "#fffbeb"],
  ["Northern Lights", "tech", "Space Grotesk", "#2dd4bf", "#0b1720", "#142b3a", "#ecfeff"],
  ["Sunday Brunch", "community", "Poppins", "#f59e0b", "#21170d", "#352519", "#fffbeb"],
];

export const seeds: SeedTheme[] = [
  ...initialSeeds,
  ...additionalThemePresets.map(
    ([name, category, font, primary, background, surface, text], index) => ({
      id: `10000000-0000-4000-8000-${(index + 11).toString(16).padStart(12, "0")}`,
      name,
      category,
      font,
      colors: { primary, background, surface, text },
    }),
  ),
];

/** Ensures the shared theme library exists. Safe to run repeatedly. */
export async function seedThemes(): Promise<void> {
  for (const seed of seeds) {
    await db
      .insert(themesTable)
      .values({ ...seed, ownerId: null })
      .onConflictDoNothing({ target: themesTable.id })
      .execute();
  }
  const inserted = await db
    .select({ id: themesTable.id, name: themesTable.name })
    .from(themesTable)
    .execute();
  console.log(`Seeded themes. Total in DB: ${inserted.length}`);
  console.log(inserted.map((t) => `  - ${t.name}`).join("\n"));
}