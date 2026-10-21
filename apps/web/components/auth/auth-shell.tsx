import { ClipboardPenIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";

interface AuthShellProps {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute -top-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full blur-3xl" />
      </div>

      <Link to="/" className="relative mb-8 flex flex-col items-center gap-3 text-center">
        <span className="bg-primary/10 text-primary flex size-12 items-center justify-center rounded-2xl border [&>svg]:size-6">
          <ClipboardPenIcon />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Formly</h1>
          <p className="text-muted-foreground text-sm">Build forms. Collect answers. Repeat.</p>
        </div>
      </Link>

      <Card className="border-border/60 bg-card/60 w-full max-w-sm shadow-xl backdrop-blur">
        <CardHeader className="pb-4">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>

      <p className="text-muted-foreground mt-6 text-xs">
        {footer ?? (
          <Link to="/login" className="hover:text-foreground">
            Back to sign in
          </Link>
        )}
      </p>
    </div>
  );
}
