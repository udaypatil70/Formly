import { createHash, randomBytes, randomUUID, scryptSync } from "node:crypto";
import { db, eq } from "./index";
import { seedThemes } from "./seed-themes";
import {
  accountsTable,
  answersTable,
  fieldsTable,
  fieldOptionsTable,
  formsTable,
  formViewsTable,
  responsesTable,
  usersTable,
  type InsertField,
  type InsertFieldOption,
  type InsertForm,
  type InsertUser,
} from "./schema";

/**
 * Password hashing for better-auth credentials.
 *
 * better-auth stores passwords as `${hexSalt}:${hexKey}` where key is scrypt
 * (N=16384, r=16, p=1, dkLen=64) of the NFKC-normalised password. This
 * re-implements that format with node:crypto so the seeded demo user can sign
 * in with the regular email/password flow.
 */
function betterAuthHashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password.normalize("NFKC"), salt, 64, {
    N: 16384,
    r: 16,
    p: 1,
    maxmem: 128 * 16384 * 16 * 2,
  });
  return `${salt}:${key.toString("hex")}`;
}

const hashIp = (ip: string) =>
  createHash("sha256").update(`formforge-salt:${ip}`).digest("hex");

// Deterministic UUIDs so re-running the seed is idempotent.
let idCounter = 0x1000;
function nextId(): string {
  idCounter += 1;
  return `00000000-0000-4000-8000-${idCounter.toString(16).padStart(12, "0")}`;
}

const DEMO_USER_ID = "20000000-0000-4000-8000-000000000001";
const DEMO_ACCOUNT_ID = "20000000-0000-4000-8000-000000000002";

const DEMO_USER: InsertUser = {
  id: DEMO_USER_ID,
  name: "Demo User",
  email: "demo@formbuilder.com",
  emailVerified: true,
  createdAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
};

type SeedOption = { label: string; value: string };
type SeedField = {
  type:
    | "short_text"
    | "long_text"
    | "email"
    | "number"
    | "single_select"
    | "multi_select"
    | "checkbox"
    | "radio"
    | "rating"
    | "date";
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: SeedOption[];
};

type SeedForm = {
  title: string;
  description: string;
  slug: string;
  themeId: string;
  createdAt: Date;
  responseCount: number;
  fields: SeedField[];
  textPools: Record<string, string[]>;
};

const THEME_IDS = {
  movies: "10000000-0000-4000-8000-000000000003",
  anime: "10000000-0000-4000-8000-000000000004",
  startups: "10000000-0000-4000-8000-000000000005",
  events: "10000000-0000-4000-8000-000000000007",
  community: "10000000-0000-4000-8000-000000000008",
};

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const ANIME_POOL = [
  "Attack on Titan", "Frieren: Beyond Journey's End", "Demon Slayer", "Jujutsu Kaisen",
  "One Piece", "Fullmetal Alchemist: Brotherhood", "My Hero Academia", "Vinland Saga",
  "Chainsaw Man", "Cowboy Bebop", "Spy x Family", "Mob Psycho 100",
];
const ANIME_COMMENT_POOL = [
  "The animation quality this season is unreal. Can't wait for the next arc.",
  "Started watching because of the hype and honestly it exceeded my expectations.",
  "The soundtrack alone makes it worth binging in one sitting.",
  "Great character development, but the pacing drags in the middle.",
  "Best isekai I've seen in years. The worldbuilding is so detailed.",
];
const MOVIE_POOL = [
  "Dune: Part Two", "Oppenheimer", "The Batman", "Everything Everywhere All at Once",
  "Spider-Man: Across the Spider-Verse", "The Godfather", "Parasite", "Interstellar",
  "Top Gun: Maverick", "Mad Max: Fury Road", "Whiplash", "The Shawshank Redemption",
];
const MOVIE_COMMENT_POOL = [
  "Visually stunning, the theater experience alone is worth it.",
  "Went in with low expectations and was blown away.",
  "A bit slow for my taste but the payoff is incredible.",
  "Rewatched it twice this month. Instant classic.",
  "The cinematography deserves every award out there.",
];
const STARTUP_ROLES = [
  "Founder", "CTO", "Product Manager", "Engineer", "Designer", "Marketer",
  "Growth Lead", "Data Scientist", "Sales Lead", "Operations",
];
const STARTUP_COMMENT_POOL = [
  "We keep reinventing our onboarding flow to fix drop-off.",
  "Biggest blocker is hiring senior engineers in a small city.",
  "Would pay for something that automates our manual reporting.",
  "Churn is our #1 metric right now, we don't even track it properly.",
];
const NAMES = [
  "Aarav", "Priya", "Rohan", "Ananya", "Vikram", "Meera", "Arjun", "Sara",
  "Kabir", "Diya", "Ethan", "Olivia", "Liam", "Zoe", "Lucas", "Mia",
  "Noah", "Ava", "Mateo", "Isla", "Kenji", "Hana", "Yuki", "Sora",
  "Elena", "Marco", "Aisha", "Omar", "Freya", "Dmitri",
];
const GAMERTAGS = [
  "PixelHawk_99", "NightFang", "SpeedRunnerX", "LunaStrike", "VortexKing",
  "BoltZapper", "ShadowReaper42", "QuantumBot", "RageQuitHero", "NovaBlitz",
  "TurboNoodle", "GhostRiven", "HexVandal", "ZeroCool_PL", "ManaManiac",
];
const GAME_COMMENT_POOL = [
  "Please add crossplay, half my friends are on console.",
  "The new patch finally fixed the matchmaking queue times.",
  "Balance feels great but the servers need more regions.",
  "More events like the summer one, that grind was the best part.",
];
const LONG_TEXT_POOL = [
  "It genuinely surprised me — the onboarding is smooth and the community is helpful.",
  "I've tried three alternatives this year and this is the first that clicked.",
  "Solid overall. A few rough edges at the start but it gets really good.",
  "Would recommend to a friend, and I already have twice this week.",
  "The detail is what got me. Someone clearly cared about the small stuff.",
];

// ─── Demo forms ────────────────────────────────────────────

const seedForms: SeedForm[] = [
  {
    title: "Anime Watchers Feedback",
    description: "Help our community pick the next binge-worthy series.",
    slug: "anime-watchers-feedback",
    themeId: THEME_IDS.anime,
    createdAt: daysAgo(34),
    responseCount: 55,
    fields: [
      { type: "short_text", label: "Favourite anime title", placeholder: "e.g. Re:Zero", required: true, options: undefined },
      { type: "multi_select", label: "Which genres do you enjoy?", required: true, options: [
        { label: "Action", value: "Action" }, { label: "Comedy", value: "Comedy" },
        { label: "Romance", value: "Romance" }, { label: "Slice of Life", value: "Slice of Life" },
        { label: "Fantasy", value: "Fantasy" }, { label: "Sci-Fi", value: "Sci-Fi" },
      ] },
      { type: "rating", label: "Rate your current favourite", required: true, options: undefined },
      { type: "single_select", label: "How often do you watch?", required: true, options: [
        { label: "Daily", value: "Daily" }, { label: "Weekly", value: "Weekly" },
        { label: "Monthly", value: "Monthly" }, { label: "Rarely", value: "Rarely" },
      ] },
      { type: "long_text", label: "What made you start watching anime?", required: false, options: undefined },
    ],
    textPools: {
      "favourite-anime-title": ANIME_POOL,
      "what-made-you-start-watching-anime": ANIME_COMMENT_POOL,
    },
  },
  {
    title: "Movie Night Reviews",
    description: "Rate the films you watched this month and tell us what to screen next.",
    slug: "movie-night-reviews",
    themeId: THEME_IDS.movies,
    createdAt: daysAgo(27),
    responseCount: 58,
    fields: [
      { type: "short_text", label: "Movie you recently watched", required: true, options: undefined },
      { type: "rating", label: "Overall rating", required: true, options: undefined },
      { type: "radio", label: "Would you recommend it?", required: true, options: [
        { label: "Yes", value: "Yes" }, { label: "No", value: "No" }, { label: "Maybe", value: "Maybe" },
      ] },
      { type: "single_select", label: "Which genre?", required: true, options: [
        { label: "Action", value: "Action" }, { label: "Drama", value: "Drama" },
        { label: "Comedy", value: "Comedy" }, { label: "Horror", value: "Horror" },
        { label: "Documentary", value: "Documentary" }, { label: "Animation", value: "Animation" },
      ] },
      { type: "checkbox", label: "I'd watch it again", required: false, options: undefined },
      { type: "long_text", label: "Share your thoughts", required: false, options: undefined },
    ],
    textPools: {
      "movie-you-recently-watched": MOVIE_POOL,
      "share-your-thoughts": MOVIE_COMMENT_POOL,
    },
  },
  {
    title: "Startup Idea Validation",
    description: "Share your biggest pain points and help us shape the roadmap.",
    slug: "startup-idea-validation",
    themeId: THEME_IDS.startups,
    createdAt: daysAgo(20),
    responseCount: 61,
    fields: [
      { type: "email", label: "Work email", required: true, options: undefined },
      { type: "short_text", label: "Your current role", required: true, options: undefined },
      { type: "single_select", label: "Team size", required: true, options: [
        { label: "Solo", value: "Solo" }, { label: "2-5", value: "2-5" },
        { label: "6-20", value: "6-20" }, { label: "21-100", value: "21-100" },
        { label: "100+", value: "100+" },
      ] },
      { type: "single_select", label: "Biggest pain point", required: true, options: [
        { label: "Hiring", value: "Hiring" }, { label: "Fundraising", value: "Fundraising" },
        { label: "Marketing", value: "Marketing" }, { label: "Engineering", value: "Engineering" },
        { label: "Cash flow", value: "Cash flow" },
      ] },
      { type: "number", label: "Months since launch", required: false, options: undefined },
      { type: "checkbox", label: "Interested in a beta invite", required: false, options: undefined },
      { type: "long_text", label: "What's missing from your stack?", required: false, options: undefined },
    ],
    textPools: {
      "your-current-role": STARTUP_ROLES,
      "whats-missing-from-your-stack": STARTUP_COMMENT_POOL,
    },
  },
  {
    title: "DevCon 2026 Registration",
    description: "Register for the spring dev meetup and pick your track.",
    slug: "devcon-2026-registration",
    themeId: THEME_IDS.events,
    createdAt: daysAgo(13),
    responseCount: 52,
    fields: [
      { type: "short_text", label: "Full name", required: true, options: undefined },
      { type: "email", label: "Email address", required: true, options: undefined },
      { type: "single_select", label: "Which track?", required: true, options: [
        { label: "Frontend", value: "Frontend" }, { label: "Backend", value: "Backend" },
        { label: "AI/ML", value: "AI/ML" }, { label: "Cloud", value: "Cloud" },
        { label: "DevTools", value: "DevTools" },
      ] },
      { type: "radio", label: "Attendance mode", required: true, options: [
        { label: "In-person", value: "In-person" }, { label: "Virtual", value: "Virtual" },
      ] },
      { type: "checkbox", label: "Need a T-shirt", required: false, options: undefined },
      { type: "number", label: "Years of experience", required: false, options: undefined },
    ],
    textPools: { "full-name": NAMES, "email-address": NAMES },
  },
  {
    title: "Gameplay Community Poll",
    description: "Vote on next season's game modes and features.",
    slug: "gameplay-community-poll",
    themeId: THEME_IDS.community,
    createdAt: daysAgo(6),
    responseCount: 54,
    fields: [
      { type: "short_text", label: "Your gamer tag", required: true, options: undefined },
      { type: "radio", label: "Which game mode next?", required: true, options: [
        { label: "Conquest", value: "Conquest" }, { label: "Battle Royale", value: "Battle Royale" },
        { label: "Co-op Raids", value: "Co-op Raids" }, { label: "Ranked 1v1", value: "Ranked 1v1" },
      ] },
      { type: "rating", label: "Rate the new patch", required: true, options: undefined },
      { type: "multi_select", label: "Features you'd love", required: true, options: [
        { label: "Crossplay", value: "Crossplay" }, { label: "Season Pass", value: "Season Pass" },
        { label: "New Maps", value: "New Maps" }, { label: "Clan System", value: "Clan System" },
        { label: "Event Modes", value: "Event Modes" },
      ] },
      { type: "checkbox", label: "Would invite a friend", required: false, options: undefined },
      { type: "long_text", label: "Any feedback for the devs?", required: false, options: undefined },
    ],
    textPools: { "your-gamer-tag": GAMERTAGS, "any-feedback-for-the-devs": GAME_COMMENT_POOL },
  },
];

// ─── Random helpers ────────────────────────────────────────

const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

const pick = <T>(arr: readonly T[]): T => arr[randInt(0, arr.length - 1)]!;

const DEVICES = ["mobile", "desktop", "desktop", "tablet"];
const BROWSERS = ["chrome", "chrome", "safari", "firefox", "edge"];

const RATING_WEIGHTS = [3, 7, 15, 40, 35];
function weightedRating(): number {
  const total = RATING_WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = randInt(1, total);
  for (let i = 0; i < RATING_WEIGHTS.length; i += 1) {
    roll -= RATING_WEIGHTS[i]!;
    if (roll <= 0) return i + 1;
  }
  return 5;
}

const isoDateInPast = (maxDays: number) => {
  const d = new Date(Date.now() - randInt(1, maxDays) * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
};

type BuiltField = { id: string; type: SeedField["type"]; options?: SeedOption[]; label: string };

function buildAnswers(
  builtFields: BuiltField[],
  textPools: Record<string, string[]>,
): Record<string, string | number | boolean | string[]> {
  const answers: Record<string, string | number | boolean | string[]> = {};
  for (const field of builtFields) {
    const poolKey = field.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const pool = textPools[poolKey];
    switch (field.type) {
      case "short_text":
        answers[field.id] = pool && pool.length > 0 ? pick(pool) : pick(NAMES);
        break;
      case "long_text":
        answers[field.id] = pool && pool.length > 0 ? pick(pool) : pick(LONG_TEXT_POOL);
        break;
      case "email":
        answers[field.id] = `${pick(NAMES).toLowerCase()}${randInt(1, 99)}@example.com`;
        break;
      case "number":
        answers[field.id] = randInt(1, 20);
        break;
      case "single_select":
      case "radio":
        answers[field.id] = pick(field.options!)!.value;
        break;
      case "multi_select": {
        const opts = field.options!;
        const count = randInt(1, Math.min(3, opts.length));
        const chosen = new Set<string>();
        while (chosen.size < count) chosen.add(pick(opts)!.value);
        answers[field.id] = [...chosen];
        break;
      }
      case "checkbox":
        answers[field.id] = Math.random() < 0.35;
        break;
      case "rating":
        answers[field.id] = weightedRating();
        break;
      case "date":
        answers[field.id] = isoDateInPast(40);
        break;
      default:
        break;
    }
  }
  return answers;
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  // 1. Ensure the shared theme library exists (idempotent).
  await seedThemes();
  console.log("Themes ready.");

  // 2. Demo user + credential account (better-auth compatible).
  const passwordHash = betterAuthHashPassword("demo123");
  await db
    .insert(usersTable)
    .values(DEMO_USER)
    .onConflictDoNothing({ target: usersTable.email })
    .execute();
  await db
    .insert(accountsTable)
    .values({
      id: DEMO_ACCOUNT_ID,
      userId: DEMO_USER_ID,
      accountId: DEMO_USER_ID,
      providerId: "credential",
      issuer: "local:credential",
      password: passwordHash,
      createdAt: DEMO_USER.createdAt,
      updatedAt: DEMO_USER.createdAt,
    })
    .onConflictDoNothing({ target: accountsTable.id })
    .execute();
  console.log("Demo user ready: demo@formbuilder.com / demo123");

  // 3. Forms, fields and options.
  for (const def of seedForms) {
    const preferredId = nextId();
    const form: InsertForm = {
      id: preferredId,
      ownerId: DEMO_USER_ID,
      title: def.title,
      description: def.description,
      slug: def.slug,
      status: "published",
      visibility: "public",
      archived: false,
      themeId: def.themeId,
      settings: {
        notifyOnResponse: false,
        thankYouMessage: "Thanks for sharing! We'll be in touch.",
      },
      createdAt: def.createdAt,
    };

    // Upsert — returns the existing id when the slug already exists so
    // subsequent field/response inserts always target the correct form.
    const [savedForm] = await db
      .insert(formsTable)
      .values(form)
      .onConflictDoUpdate({
        target: formsTable.slug,
        set: { ownerId: form.ownerId, title: form.title, description: form.description, themeId: form.themeId, settings: form.settings },
      })
      .returning({ id: formsTable.id })
      .execute();
    const formId = savedForm!.id;

    console.log(`  ✓ ${def.title}`);

    // Clear previous fields/options so re-runs don't duplicate (cascade deletes options).
    await db.delete(fieldsTable).where(eq(fieldsTable.formId, formId)).execute();

    const builtFields: BuiltField[] = [];
    const fieldRows: InsertField[] = [];
    const optionRows: InsertFieldOption[] = [];

    for (const [index, fieldDef] of def.fields.entries()) {
      const fieldId = nextId();
      builtFields.push({ id: fieldId, type: fieldDef.type, options: fieldDef.options, label: fieldDef.label });
      fieldRows.push({
        id: fieldId,
        formId,
        type: fieldDef.type,
        label: fieldDef.label,
        placeholder: fieldDef.placeholder ?? null,
        required: fieldDef.required ?? false,
        order: index,
        validationRules: {},
      });
      fieldDef.options?.forEach((option, optionIndex) => {
        optionRows.push({
          id: nextId(),
          fieldId,
          label: option.label,
          value: option.value,
          order: optionIndex,
        });
      });
    }

    await db.insert(fieldsTable).values(fieldRows).onConflictDoNothing().execute();
    await db.insert(fieldOptionsTable).values(optionRows).onConflictDoNothing().execute();

    // 4. Refresh responses, answers and views for this form.
    await db.delete(responsesTable).where(eq(responsesTable.formId, formId)).execute();
    await db.delete(formViewsTable).where(eq(formViewsTable.formId, formId)).execute();

    const batchSize = 25;
    const responseBatches: typeof responsesTable.$inferInsert[][] = [];
    for (let i = 0; i < def.responseCount; i += batchSize) {
      const batch: (typeof responsesTable.$inferInsert)[] = [];
      for (let j = 0; j < batchSize && i + j < def.responseCount; j += 1) {
        batch.push({
          formId,
          submittedAt: daysAgo(randInt(0, 45)),
          ipHash: hashIp(`${randInt(1, 250)}.${randInt(0, 255)}.${randInt(0, 255)}.${randInt(1, 254)}`),
          completedInSeconds: randInt(48, 420),
          device: pick(DEVICES),
          browser: pick(BROWSERS),
        });
      }
      responseBatches.push(batch);
    }

    const insertedResponses: { id: string; submittedAt: Date }[] = [];
    for (const batch of responseBatches) {
      const rows = await db.insert(responsesTable).values(batch).returning({ id: responsesTable.id, submittedAt: responsesTable.submittedAt }).execute();
      insertedResponses.push(...rows);
    }

    const answerBatches: (typeof answersTable.$inferInsert)[] = [];
    for (const response of insertedResponses) {
      const answerValues = buildAnswers(builtFields, def.textPools);
      for (const field of builtFields) {
        const value = answerValues[field.id];
        if (value === undefined) continue;
        answerBatches.push({
          id: randomUUID(),
          responseId: response.id,
          fieldId: field.id,
          value,
        });
      }
    }
    for (let i = 0; i < answerBatches.length; i += 50) {
      await db.insert(answersTable).values(answerBatches.slice(i, i + 50)).execute();
    }

    const viewCount = Math.round(def.responseCount * randInt(22, 30) / 10);
    const viewBatches: { id: string; formId: string; viewedAt: Date; device: string; browser: string }[] = [];
    for (let i = 0; i < viewCount; i += 1) {
      viewBatches.push({
        id: randomUUID(),
        formId,
        viewedAt: new Date(Date.now() - randInt(0, 45) * 24 * 60 * 60 * 1000),
        device: pick(DEVICES),
        browser: pick(BROWSERS),
      });
    }
    for (let i = 0; i < viewBatches.length; i += 50) {
      await db.insert(formViewsTable).values(viewBatches.slice(i, i + 50)).execute();
    }

    console.log(`      ↳ ${insertedResponses.length} responses, ${answerBatches.length} answers, ${viewBatches.length} views`);
  }

  console.log("\nDone. All 5 demo forms are published and prepopulated.");
  console.log("Sign in at http://localhost:3000/login with demo@formbuilder.com / demo123");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});