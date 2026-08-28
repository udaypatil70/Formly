"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { api } from "~/trpc/client";

export default function CreateFormPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreateForm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("Form title is required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const newForm = await api.form.create.mutate({
        title: title.trim(),
        description: description.trim() || undefined,
        slug: slug.trim() || undefined,
        visibility: "public",
      });

      router.push(`/builder/${newForm.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create form");
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <Button variant="outline" onClick={() => router.push("/")} className="mb-6">
            ← Back to Dashboard
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Create a New Form</CardTitle>
            <CardDescription>
              Start building your form by providing basic information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateForm} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-800">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="title">Form Title *</Label>
                <Input
                  id="title"
                  placeholder="Enter form title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Enter form description (optional)"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  disabled={loading}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">URL Slug</Label>
                <Input
                  id="slug"
                  placeholder="form-url-slug (optional)"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={loading}
                />
                <p className="text-xs text-slate-500">Leave empty to auto-generate from title</p>
              </div>

              <div className="flex gap-4">
                <Button type="submit" disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                  {loading ? "Creating..." : "Create Form"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.push("/")}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
