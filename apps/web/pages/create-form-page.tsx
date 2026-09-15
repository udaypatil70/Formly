import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeftIcon, FilePlus2Icon, Loader2Icon, SparklesIcon } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "~/trpc/client";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 255);

export function CreateFormPage() {
  const navigate = useNavigate();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const effectiveSlug = slugTouched && slug.trim() ? slugify(slug) : slugify(title);

  const createForm = trpc.form.create.useMutation();

  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Form title is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const newForm = await createForm.mutateAsync({
        title: trimmedTitle,
        description: description.trim() || undefined,
        slug: effectiveSlug || undefined,
        visibility: "public",
      });
      toast.success("Form created");
      navigate(`/builder/${newForm.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create form");
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="bg-primary/10 absolute -top-40 left-1/2 h-80 w-[40rem] -translate-x-1/2 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-xl">
        <div className="mb-6 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
            className="text-muted-foreground -ml-2"
          >
            <ArrowLeftIcon />
            Back to dashboard
          </Button>
        </div>

        <Card className="border-border/60 bg-card/60 shadow-xl backdrop-blur">
          <CardHeader>
            <div className="mb-2 flex size-11 items-center justify-center rounded-xl border bg-primary/10 text-primary">
              <FilePlus2Icon className="size-5" />
            </div>
            <CardTitle className="text-xl">Create a new form</CardTitle>
            <CardDescription>
              Give your form a name — you can add fields right after.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateForm} className="space-y-5">
              {error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="title">Form title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Customer feedback survey"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setError("");
                  }}
                  disabled={loading}
                  autoFocus
                  className="h-10"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Short description shown on the form (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL slug</Label>
                <div className="flex items-center gap-1 rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                  <span className="shrink-0">/f/</span>
                  <input
                    id="slug"
                    value={slugTouched ? slug : effectiveSlug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugTouched(true);
                    }}
                    onBlur={() => setSlug(slugify(slug))}
                    placeholder="auto-generated"
                    disabled={loading}
                    className="h-9 min-w-0 flex-1 border-none bg-transparent py-0 pl-0 focus:outline-none"
                  />
                </div>
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <SparklesIcon className="size-3" />
                  Leave blank to auto-generate from the title.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" size="lg" disabled={loading} className="flex-1">
                  {loading && <Loader2Icon className="animate-spin" />}
                  {loading ? "Creating…" : "Create form"}
                </Button>
                <Button
                  type="button"
                  size="lg"
                  variant="outline"
                  onClick={() => navigate("/")}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}