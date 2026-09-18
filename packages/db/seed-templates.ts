import { db } from "./index";
import { count, eq } from "drizzle-orm";
import {
  fieldsTable,
  fieldOptionsTable,
  formsTable,
  usersTable,
} from "./schema";

type FieldType =
  | "short_text"
  | "long_text"
  | "email"
  | "number"
  | "single_select"
  | "multi_select"
  | "checkbox"
  | "radio"
  | "rating"
  | "date"
  | "page_break";

import { seeds as themeSeeds } from "./seed-themes";

const SYSTEM_ID = "00000000-0000-4000-8000-0000000000a0";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 255);

interface SeedField {
  /** Local key, referenced by other fields' `showIf.fieldKey`. */
  key: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  validationRules?: Record<string, number | string>;
  options?: (string | { label: string; value: string })[];
  showIf?: {
    fieldKey: string;
    operator: "equals" | "not_equals" | "contains" | "greater_than" | "less_than";
    value: string | number | boolean;
  };
}

interface SeedTemplate {
  id: string;
  title: string;
  description: string;
  slug: string;
  category: string;
  themeId: string;
  settings?: {
    stepMode?: "page" | "question";
    thankYouMessage?: string;
    notifyOnResponse?: boolean;
  };
  fields: SeedField[];
}

const themeByCategory: Record<string, string> = Object.fromEntries(
  themeSeeds.map((t) => [t.category, t.id]),
);

export const templates: SeedTemplate[] = [
  {
    id: "20000000-0000-4000-8000-000000000001",
    title: "Customer Feedback Survey",
    description:
      "A polished 5-question survey that captures ratings, wins and improvement ideas.",
    slug: "customer-feedback-survey",
    category: "feedback",
    themeId: themeByCategory["startups"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "Thanks for your feedback — it genuinely helps us improve.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "overall", type: "radio", label: "How satisfied are you overall?", required: true, options: ["Very satisfied", "Somewhat satisfied", "Neutral", "Somewhat dissatisfied", "Very dissatisfied"] },
      { key: "liked", type: "long_text", label: "What did you like most?", helpText: "Share something memorable about your experience.", required: true },
      { key: "improve", type: "long_text", label: "What could we do better?", required: false },
      { key: "nps", type: "rating", label: "How likely are you to recommend us?", required: true },
      { key: "updates", type: "checkbox", label: "Can we email you product updates?", required: false },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000002",
    title: "Event RSVP",
    description:
      "Collect guest details, session preferences and dietary needs for your next event.",
    slug: "event-rsvp",
    category: "events",
    themeId: themeByCategory["events"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "You're on the list! We'll email the details closer to the date.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "name", type: "short_text", label: "Full name", required: true },
      { key: "email", type: "email", label: "Email address", required: true },
      { key: "guests", type: "number", label: "How many guests are you bringing?", required: true, validationRules: { min: 0, max: 10 } },
      { key: "sessions", type: "multi_select", label: "Which sessions interest you?", required: true, options: ["Morning keynote", "Workshops", "Panel discussion", "Networking hour"] },
      { key: "diet", type: "long_text", label: "Dietary requirements", required: false, placeholder: "e.g. vegetarian, nut allergy" },
      { key: "attend", type: "radio", label: "Can you make it?", required: true, options: ["Count me in", "Maybe", "Sorry, can't make it"] },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000003",
    title: "Lead Capture",
    description:
      "Grab contact details and qualify inbound leads with a handful of quick questions.",
    slug: "lead-capture",
    category: "sales",
    themeId: themeByCategory["movies"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "Thanks! Our team will reach out within one business day.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "name", type: "short_text", label: "Full name", required: true },
      { key: "email", type: "email", label: "Work email", required: true },
      { key: "company", type: "short_text", label: "Company", required: false },
      { key: "size", type: "single_select", label: "Company size", required: true, options: ["1-10", "11-50", "51-200", "200+"] },
      { key: "source", type: "single_select", label: "How did you hear about us?", required: false, options: ["Search", "Social media", "Referral", "Conference", "Advertisement", "Other"] },
      { key: "message", type: "long_text", label: "What are you looking for?", required: true, placeholder: "Tell us about your project…" },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000004",
    title: "Job Application",
    description:
      "Gather applications with role fit, experience and availability in one place.",
    slug: "job-application",
    category: "careers",
    themeId: themeByCategory["community"]!,
    settings: {
      stepMode: "page",
      thankYouMessage: "Application received! We'll be in touch if there's a match.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "name", type: "short_text", label: "Full name", required: true },
      { key: "email", type: "email", label: "Email address", required: true },
      { key: "phone", type: "short_text", label: "Phone number", required: true, placeholder: "+1 (555) 000-0000" },
      { key: "role", type: "single_select", label: "Which role are you applying for?", required: true, options: ["Frontend Engineer", "Backend Engineer", "Product Designer", "Growth Marketer"] },
      { key: "page_break", type: "page_break", label: "Experience", required: false },
      { key: "experience", type: "short_text", label: "Years of relevant experience", required: true, validationRules: { pattern: "^[0-9]+$" } },
      { key: "why", type: "long_text", label: "Why do you want to work here?", required: true },
      { key: "relocate", type: "radio", label: "Are you open to relocation?", required: true, options: ["Yes", "No", "Partially remote"] },
      { key: "start", type: "date", label: "Earliest start date", required: true },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000005",
    title: "Beta Signup Waitlist",
    description:
      "Build hype for your launch and learn exactly who wants in and why.",
    slug: "beta-signup-waitlist",
    category: "product",
    themeId: themeByCategory["os"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "You're on the waitlist! We'll send early access invites in order.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "email", type: "email", label: "Email address", required: true },
      { key: "name", type: "short_text", label: "Name", required: true },
      { key: "audience", type: "radio", label: "Which best describes you?", required: true, options: ["Developer", "Designer", "Business owner", "Curious explorer"] },
      { key: "use", type: "long_text", label: "What would you use this for?", required: false },
      { key: "features", type: "multi_select", label: "Most important features", required: false, options: ["Speed", "Integrations", "Analytics", "Customization", "Support"] },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000006",
    title: "NPS & CSAT Survey",
    description:
      "Track loyalty with a Net Promoter Score and dig into the why behind it.",
    slug: "nps-csat-survey",
    category: "feedback",
    themeId: themeByCategory["tech"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "Thanks for helping us measure what matters.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "nps", type: "single_select", label: "How likely are you to recommend us? (0-10)", required: true, options: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"] },
      { key: "reason", type: "long_text", label: "What is the main reason for your score?", required: true },
      { key: "csat", type: "radio", label: "How satisfied are you with our product?", required: true, options: ["Extremely satisfied", "Quite satisfied", "Neither", "Quite dissatisfied", "Extremely dissatisfied"] },
      { key: "free", type: "long_text", label: "Anything else you'd like to share?", required: false },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000007",
    title: "Course Evaluation",
    description:
      "Measure instructor quality, course material and overall impact at the end of a course.",
    slug: "course-evaluation",
    category: "education",
    themeId: themeByCategory["community"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "Your feedback will shape the next cohort. Thank you!",
      notifyOnResponse: true,
    },
    fields: [
      { key: "course", type: "single_select", label: "Which course are you evaluating?", required: true, options: ["Intro to Design", "Advanced JavaScript", "Data Science 101", "Product Management"] },
      { key: "instructor", type: "radio", label: "How would you rate the instructor?", required: true, options: ["5 - Excellent", "4", "3", "2", "1 - Poor"] },
      { key: "material", type: "rating", label: "How useful was the course material?", required: true },
      { key: "liked", type: "long_text", label: "What did you love?", required: true },
      { key: "improve", type: "long_text", label: "What should we improve?", required: false },
      { key: "recommend", type: "radio", label: "Would you recommend this course?", required: true, options: ["Yes", "No", "Not sure"] },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000008",
    title: "Workshop Sign-Up",
    description:
      "Gauge experience levels and goals so you can tailor your workshop on the fly.",
    slug: "workshop-signup",
    category: "events",
    themeId: themeByCategory["events"]!,
    settings: {
      stepMode: "page",
      thankYouMessage: "See you at the workshop! A calendar invite is on its way.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "name", type: "short_text", label: "Name", required: true },
      { key: "email", type: "email", label: "Email address", required: true },
      { key: "level", type: "radio", label: "What's your experience level?", required: true, options: ["Beginner", "Intermediate", "Advanced"] },
      { key: "advanced_topic", type: "single_select", label: "Which advanced topic do you want?", required: false, showIf: { fieldKey: "level", operator: "equals", value: "Advanced" }, options: ["Performance tuning", "Security hardening", "Scaling infra"] },
      { key: "goals", type: "long_text", label: "What do you hope to get out of it?", required: false, placeholder: "Optional, but helpful" },
    ],
  },
  {
    id: "20000000-0000-4000-8000-000000000009",
    title: "Bug Report",
    description:
      "Standardize bug submissions so your team gets repro steps and severity up front.",
    slug: "bug-report",
    category: "product",
    themeId: themeByCategory["os"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "Thanks for the report — our team will triage it soon.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "happened", type: "long_text", label: "What happened?", required: true, placeholder: "Describe the issue…" },
      { key: "expected", type: "long_text", label: "What did you expect to happen?", required: true },
      { key: "severity", type: "radio", label: "Severity", required: true, options: ["Critical - blocking", "High", "Medium", "Low"] },
      { key: "device", type: "single_select", label: "Device", required: true, options: ["Desktop", "Mobile", "Tablet"] },
      { key: "browser", type: "single_select", label: "Browser", required: true, options: ["Chrome", "Firefox", "Safari", "Edge", "Other"] },
      { key: "steps", type: "long_text", label: "Steps to reproduce", required: false, helpText: "Number each step. Include any error messages." },
      { key: "email", type: "email", label: "Email for updates", required: false },
    ],
  },
  {
    id: "20000000-0000-4000-8000-00000000000a",
    title: "Appointment Request",
    description:
      "Take booking requests with preferred dates, times and reason for visit.",
    slug: "appointment-request",
    category: "health",
    themeId: themeByCategory["community"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "Request received! We'll confirm your slot by email.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "name", type: "short_text", label: "Full name", required: true },
      { key: "email", type: "email", label: "Email address", required: true },
      { key: "phone", type: "short_text", label: "Phone number", required: true, placeholder: "+1 (555) 000-0000" },
      { key: "date", type: "date", label: "Preferred date", required: true },
      { key: "time", type: "single_select", label: "Preferred time", required: true, options: ["Morning", "Afternoon", "Evening"] },
      { key: "reason", type: "single_select", label: "Reason for visit", required: true, options: ["Consultation", "Follow-up", "Routine check", "Something else"] },
      { key: "notes", type: "long_text", label: "Notes", required: false, placeholder: "Anything we should know?" },
    ],
  },
  {
    id: "20000000-0000-4000-8000-00000000000b",
    title: "Volunteer Registration",
    description:
      "Match volunteers to tasks based on interests, availability and location.",
    slug: "volunteer-registration",
    category: "community",
    themeId: themeByCategory["community"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "Welcome aboard! We'll be in touch with next steps.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "name", type: "short_text", label: "Full name", required: true },
      { key: "email", type: "email", label: "Email address", required: true },
      { key: "city", type: "short_text", label: "City", required: true },
      { key: "help", type: "multi_select", label: "How would you like to help?", required: true, options: ["Events", "Fundraising", "Mentoring", "Logistics", "Content & social"] },
      { key: "availability", type: "multi_select", label: "When are you available?", required: true, options: ["Weekdays", "Weekends", "Mornings", "Evenings"] },
      { key: "emergency", type: "short_text", label: "Emergency contact", required: false },
      { key: "notes", type: "long_text", label: "Anything else?", required: false },
    ],
  },
  {
    id: "20000000-0000-4000-8000-00000000000c",
    title: "Restaurant Reservation",
    description:
      "Reserve tables with party size, seating preference and special requests.",
    slug: "restaurant-reservation",
    category: "events",
    themeId: themeByCategory["movies"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "Your table request is in! We'll confirm shortly.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "name", type: "short_text", label: "Name on reservation", required: true },
      { key: "email", type: "email", label: "Email address", required: true },
      { key: "party", type: "number", label: "Party size", required: true, validationRules: { min: 1, max: 20 } },
      { key: "date", type: "date", label: "Date", required: true },
      { key: "time", type: "single_select", label: "Preferred time", required: true, options: ["12:00", "1:00 PM", "7:00 PM", "8:00 PM", "9:00 PM"] },
      { key: "seating", type: "radio", label: "Seating preference", required: true, options: ["Indoor", "Outdoor", "Window", "No preference"] },
      { key: "requests", type: "long_text", label: "Special requests", required: false, placeholder: "Allergies, birthdays, accessibility…" },
    ],
  },
  {
    id: "20000000-0000-4000-8000-00000000000d",
    title: "Sponsorship Inquiry",
    description:
      "Qualify potential sponsors and partners with clear budgets and audience info.",
    slug: "sponsorship-inquiry",
    category: "sales",
    themeId: themeByCategory["tech"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "Thanks for your interest! Our partnerships team will reply shortly.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "company", type: "short_text", label: "Company", required: true },
      { key: "email", type: "email", label: "Contact email", required: true },
      { key: "type", type: "radio", label: "Interest", required: true, options: ["Sponsor", "Partner", "Media", "Other"] },
      { key: "budget", type: "single_select", label: "Budget range", required: true, options: ["Under $1k", "$1k - $5k", "$5k - $20k", "$20k+"] },
      { key: "audience", type: "long_text", label: "Tell us about your audience", required: true },
      { key: "questions", type: "long_text", label: "Any questions?", required: false },
    ],
  },
  {
    id: "20000000-0000-4000-8000-00000000000e",
    title: "Podcast Guest Application",
    description:
      "Find great guests for your show with topics, links and audience size.",
    slug: "podcast-guest-application",
    category: "community",
    themeId: themeByCategory["games"]!,
    settings: {
      stepMode: "question",
      thankYouMessage: "Thanks for applying! We review every guest inquiry.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "name", type: "short_text", label: "Name", required: true },
      { key: "email", type: "email", label: "Email address", required: true },
      { key: "topic", type: "long_text", label: "What would you love to discuss?", required: true },
      { key: "work", type: "short_text", label: "Link to your work", required: true, placeholder: "Website, portfolio or socials" },
      { key: "audience", type: "number", label: "Your audience size", required: false, validationRules: { min: 0 } },
      { key: "availability", type: "radio", label: "When can you record?", required: true, options: ["Weekdays", "Weekends", "Flexible"] },
    ],
  },
  {
    id: "20000000-0000-4000-8000-00000000000f",
    title: "Internship Application",
    description:
      "Streamline internship intake with skills, graduation timeline and portfolio.",
    slug: "internship-application",
    category: "careers",
    themeId: themeByCategory["startups"]!,
    settings: {
      stepMode: "page",
      thankYouMessage: "Application received! We'll review and reach out soon.",
      notifyOnResponse: true,
    },
    fields: [
      { key: "name", type: "short_text", label: "Full name", required: true },
      { key: "email", type: "email", label: "Email address", required: true },
      { key: "university", type: "short_text", label: "University", required: true },
      { key: "year", type: "single_select", label: "Graduation year", required: true, options: ["2026", "2027", "2028", "2029"] },
      { key: "page_break", type: "page_break", label: "Skills & fit", required: false },
      { key: "skills", type: "multi_select", label: "Skills", required: true, options: ["JavaScript", "TypeScript", "React", "Node.js", "SQL", "Design", "Writing"] },
      { key: "why", type: "long_text", label: "Why this internship?", required: true },
      { key: "start", type: "date", label: "Available from", required: true },
      { key: "portfolio", type: "short_text", label: "Portfolio / GitHub", required: false, placeholder: "Link" },
    ],
  },
];

/** Ensures a template catalog exists. Safe to run repeatedly. */
export async function seedTemplates(): Promise<void> {
  await db
    .insert(usersTable)
    .values({
      id: SYSTEM_ID,
      name: "Formforge Templates",
      email: "templates@formforge.app",
      emailVerified: true,
    })
    .onConflictDoNothing({ target: usersTable.id })
    .execute();

  let created = 0;
  for (const template of templates) {
    const inserted = await db
      .insert(formsTable)
      .values({
        id: template.id,
        ownerId: SYSTEM_ID,
        title: template.title,
        description: template.description,
        slug: template.slug,
        status: "draft",
        visibility: "public",
        archived: false,
        isFeatured: false,
        isTemplate: true,
        templateCategory: template.category,
        themeId: template.themeId,
        settings: template.settings ?? {},
      })
      .onConflictDoNothing({ target: formsTable.id })
      .returning({ id: formsTable.id })
      .execute();

    if (inserted.length === 0) continue;
    created += 1;

    const fieldIds = new Map<string, string>();
    for (const field of template.fields) {
      const namedOptions = (field.options ?? []).map((o) =>
        typeof o === "string" ? { label: o, value: slugify(o) } : o,
      );
      const rows = await db
        .insert(fieldsTable)
        .values({
          formId: template.id,
          type: field.type,
          label: field.label,
          placeholder: field.placeholder ?? null,
          helpText: field.helpText ?? null,
          required: field.required ?? false,
          order: template.fields.indexOf(field),
          validationRules: field.validationRules ?? {},
          conditionalLogic: field.showIf
            ? {
                showIf: {
                  fieldId: "", // filled below once referenced field exists
                  operator: field.showIf.operator,
                  value: field.showIf.value,
                },
              }
            : {},
        })
        .returning()
        .execute();
      const createdField = rows[0]!;
      fieldIds.set(field.key, createdField.id);

      if (namedOptions.length > 0) {
        await db
          .insert(fieldOptionsTable)
          .values(
            namedOptions.map((o, i) => ({
              fieldId: createdField.id,
              label: o.label,
              value: o.value,
              order: i,
            })),
          )
          .execute();
      }
    }

    // Resolve cross-field references in conditional logic.
    for (const field of template.fields) {
      if (!field.showIf) continue;
      const fieldId = fieldIds.get(field.key);
      const source = fieldIds.get(field.showIf.fieldKey);
      if (!fieldId || !source) continue;
      await db
        .update(fieldsTable)
        .set({
          conditionalLogic: {
            showIf: {
              fieldId: source,
              operator: field.showIf.operator,
              value: field.showIf.value,
            },
          },
        })
        .where(eq(fieldsTable.id, fieldId))
        .execute();
    }
  }

const [countRow] = await db
    .select({ count: count() })
    .from(formsTable)
    .where(eq(formsTable.isTemplate, true))
    .execute();

  console.log(
    `Seeded templates. Created: ${created}, total in DB: ${countRow?.count}`,
  );
  console.log(templates.map((t) => `  - ${t.title}`).join("\n"));
}