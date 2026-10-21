import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ClipboardPenIcon, LogInIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";

import { getAuthEndpoints } from "~/lib/api-origin";
import { trpc } from "~/trpc/client";
import { TurnstileWidget } from "~/components/public/turnstile-widget";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Spinner } from "~/components/ui/spinner";

type Mode = "sign-in" | "sign-up";

const TURNSTILE_SITE_KEY: string = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "";

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const session = trpc.auth.getSession.useQuery();
  const config = trpc.auth.getConfig.useQuery();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const handledQuery = useRef(false);

  const homeFor = (user?: { role?: "admin" | "user" } | null) =>
    user?.role === "admin" ? "/admin" : "/dashboard";

  useEffect(() => {
    if (session.data?.user) {
      navigate(homeFor(session.data.user), { replace: true });
    }
  }, [session.data?.user, navigate]);

  useEffect(() => {
    if (handledQuery.current) return;
    handledQuery.current = true;

    if (searchParams.get("verified") === "1") {
      toast.success("Email verified. Welcome to Formly!");
    } else if (searchParams.get("error")) {
      setError("This verification link is invalid or has expired.");
    }
  }, [searchParams]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
  };

  const handleGoogleSignIn = () => {
    setGoogleLoading(true);
    window.location.href = getAuthEndpoints().social("google");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    if (mode === "sign-up" && !name.trim()) {
      setError("Please enter your name");
      return;
    }
    if (TURNSTILE_SITE_KEY && !turnstileToken) {
      setError("Please complete the verification.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { signIn, signUp } = getAuthEndpoints();
      const url = mode === "sign-in" ? signIn : signUp;
      const payload =
        mode === "sign-in"
          ? { email: email.trim(), password }
          : {
              name: name.trim(),
              email: email.trim(),
              password,
              callbackURL: `${window.location.origin}/login?verified=1`,
            };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(turnstileToken ? { "x-turnstile-token": turnstileToken } : {}),
        },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const body = (await response.json().catch(() => null)) as {
        code?: string;
        message?: string;
        error?: { code?: string; message?: string };
      } | null;

      if (!response.ok) {
        const code = body?.error?.code ?? body?.code;
        const message =
          code === "EMAIL_NOT_VERIFIED"
            ? "Verify your email before signing in. We just sent a fresh link to your inbox."
            : (body?.error?.message ?? body?.message ?? "Authentication failed");
        setError(message);
        setTurnstileToken("");
        setTurnstileResetKey((key) => key + 1);
        setLoading(false);
        return;
      }

      if (mode === "sign-up") {
        if (config.data?.requireEmailVerification) {
          toast.success("Account created. Check your inbox to verify your email.");
          setMode("sign-in");
          setPassword("");
          setTurnstileToken("");
          setTurnstileResetKey((key) => key + 1);
          setLoading(false);
          return;
        }
        toast.success(
          config.data?.emailVerificationEnabled
            ? "Account created. Check your inbox to verify your email."
            : "Account created",
        );
      } else {
        toast.success("Welcome back!");
      }

      const next = await session.refetch();
      navigate(homeFor(next.data?.user), { replace: true });
    } catch {
      setError("Couldn't reach the API server. Is it running?");
      setTurnstileToken("");
      setTurnstileResetKey((key) => key + 1);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute -top-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full blur-3xl" />
      </div>

      <div className="relative mb-8 flex flex-col items-center gap-3 text-center">
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-2xl border [&>svg]:size-6">
          <ClipboardPenIcon />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Formly</h1>
          <p className="text-muted-foreground text-sm">Build forms. Collect answers. Repeat.</p>
        </div>
      </div>

      <Card className="border-border/60 w-full max-w-sm bg-card/60 shadow-xl backdrop-blur">
        <CardHeader className="pb-4">
          <CardTitle>{mode === "sign-in" ? "Sign in" : "Create account"}</CardTitle>
          <CardDescription>
            {mode === "sign-in"
              ? "Enter your details to manage your forms."
              : "Start building forms in seconds."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            onClick={() => handleGoogleSignIn()}
            disabled={googleLoading || loading}
            className="border-input bg-background hover:bg-accent hover:text-accent-foreground flex h-10 w-full items-center justify-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            {googleLoading ? <Spinner /> : <GoogleIcon />}
            Continue with Google
          </button>

          <div className="text-muted-foreground flex items-center gap-3 py-4 text-xs uppercase tracking-wide">
            <span className="bg-border h-px flex-1" />
            or continue with email
            <span className="bg-border h-px flex-1" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {mode === "sign-up" && (
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  placeholder="Jane Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={loading}
                  autoComplete="name"
                  className="h-10"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                autoComplete="email"
                className="h-10"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                {mode === "sign-in" && config.data?.forgotPasswordEnabled ? (
                  <Link
                    to="/forgot-password"
                    className="text-primary text-xs font-medium hover:underline"
                  >
                    Forgot password?
                  </Link>
                ) : null}
              </div>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                className="h-10"
              />
            </div>

            {TURNSTILE_SITE_KEY ? (
              <TurnstileWidget
                siteKey={TURNSTILE_SITE_KEY}
                onToken={setTurnstileToken}
                onExpire={() => setTurnstileToken("")}
                resetKey={turnstileResetKey}
              />
            ) : null}

            <Button type="submit" className="h-10 w-full" disabled={loading}>
              {loading ? <Spinner /> : mode === "sign-in" ? <LogInIcon /> : <UserPlusIcon />}
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
          </form>

          <div className="text-muted-foreground mt-5 text-center text-sm">
            {mode === "sign-in" ? "New to Formly? " : "Already have an account? "}
            <button
              type="button"
              onClick={() => switchMode(mode === "sign-in" ? "sign-up" : "sign-in")}
              className="text-primary font-medium hover:underline"
            >
              {mode === "sign-in" ? "Create an account" : "Sign in"}
            </button>
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground mt-6 text-xs">
        <Link to="/dashboard" className="hover:text-foreground">
          Back to dashboard
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-4">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}
