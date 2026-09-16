import { type FormEvent } from "react";
import { ArrowRightIcon, LockIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { backgroundStyle, fontFamilyFor } from "~/lib/theme-utils";
import type { PublicTheme } from "./types";

interface PasswordGateProps {
  title: string;
  description?: string | null;
  theme: PublicTheme | null;
  incorrectPassword: boolean;
  value: string;
  onValueChange: (value: string) => void;
  onUnlock: (password: string) => void;
}

export function PasswordGate({
  title,
  description,
  theme,
  incorrectPassword,
  value,
  onValueChange,
  onUnlock,
}: PasswordGateProps) {
  const primary = theme?.colors.primary ?? "#6d28d9";
  const surface = theme?.colors.surface ?? "#18181b";
  const text = theme?.colors.text ?? "#fafafa";

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!value.trim()) return;
    onUnlock(value.trim());
  };

  return (
    <div
      style={{
        ...backgroundStyle(theme),
        color: text,
        fontFamily: fontFamilyFor(theme?.font),
        minHeight: "100%",
      }}
    >
      <div className="mx-auto flex w-full max-w-xl flex-col px-4 py-16">
        <div
          className="rounded-2xl border p-6 text-center sm:p-8"
          style={{ backgroundColor: surface, borderColor: `${text}1f` }}
        >
          <div
            className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full"
            style={{ backgroundColor: `${primary}1f`, color: primary }}
          >
            <LockIcon className="size-5" />
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description ? (
            <p className="mt-2 text-sm opacity-80">{description}</p>
          ) : null}
          <p className="mt-4 text-sm opacity-70">
            {incorrectPassword
              ? "That password isn't right. Please try again."
              : "This form is password protected. Enter the password to open it."}
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-6 flex max-w-sm items-center gap-2"
          >
            <Input
              type="password"
              value={value}
              onChange={(e) => onValueChange(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              autoFocus
              aria-invalid={incorrectPassword}
              className="flex-1"
            />
            <Button type="submit" style={{ backgroundColor: primary }}>
              <ArrowRightIcon />
              Unlock
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}