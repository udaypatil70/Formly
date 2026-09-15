import type { CSSProperties } from "react";
import type {
  BuilderTheme,
  BuilderThemeBackground,
} from "~/lib/builder-types";

export interface ThemeFontOption {
  label: string;
  family: string;
  css: string;
}

/** Fonts exposed in the theme editor; loaded via Google Fonts in index.html. */
export const THEME_FONTS: ThemeFontOption[] = [
  { label: "System default", family: "system", css: "system-ui, sans-serif" },
  { label: "Inter", family: "Inter", css: "'Inter', system-ui, sans-serif" },
  { label: "Poppins", family: "Poppins", css: "'Poppins', sans-serif" },
  { label: "Montserrat", family: "Montserrat", css: "'Montserrat', sans-serif" },
  { label: "Space Grotesk", family: "Space Grotesk", css: "'Space Grotesk', sans-serif" },
  { label: "Raleway", family: "Raleway", css: "'Raleway', sans-serif" },
  { label: "Roboto", family: "Roboto", css: "'Roboto', sans-serif" },
  { label: "Playfair Display", family: "Playfair Display", css: "'Playfair Display', serif" },
  { label: "Lora", family: "Lora", css: "'Lora', serif" },
  { label: "JetBrains Mono", family: "JetBrains Mono", css: "'JetBrains Mono', monospace" },
];

export function fontFamilyFor(font: string | null | undefined): string {
  const match = THEME_FONTS.find((f) => f.family === font);
  return match?.css ?? THEME_FONTS[0]!.css;
}

/** Resolves a theme's page background to CSS background/color style props. */
export function backgroundStyle(
  theme: Pick<BuilderTheme, "colors"> & { background?: BuilderThemeBackground | null } | null,
): CSSProperties {
  const background = theme?.background;
  if (background) {
    switch (background.type) {
      case "gradient":
        return { backgroundImage: `linear-gradient(135deg, ${background.from}, ${background.to})` };
      case "image":
        return {
          backgroundImage: `url('${background.url}')`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        };
      case "solid":
        return { backgroundColor: background.color };
    }
  }
  return { backgroundColor: theme?.colors.background ?? "#0b0b0d" };
}

export const DEFAULT_THEME_COLORS = {
  primary: "#6366f1",
  background: "#0b0b0f",
  surface: "#16161c",
  text: "#f4f4f5",
};