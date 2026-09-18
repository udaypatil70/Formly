import { MoonIcon, SunIcon } from "lucide-react";

import { useTheme } from "~/components/ui/theme-provider";
import { Button } from "~/components/ui/button";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <SunIcon className="size-4" />
      ) : (
        <MoonIcon className="size-4" />
      )}
      <span className="sr-only">{theme === "dark" ? "Dark mode" : "Light mode"}</span>
    </Button>
  );
}