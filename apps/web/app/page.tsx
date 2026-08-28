import Link from "next/link";
import { api } from "~/trpc/server";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Badge } from "~/components/ui/badge";

export const dynamic = "force-dynamic";

const UIComponents = [
  { name: "Accordion", desc: "Expandable content sections" },
  { name: "Alert", desc: "Alert messages and notifications" },
  { name: "Alert Dialog", desc: "Confirmation dialogs" },
  { name: "Aspect Ratio", desc: "Maintain aspect ratio containers" },
  { name: "Avatar", desc: "User profile pictures" },
  { name: "Badge", desc: "Labeled status indicators" },
  { name: "Breadcrumb", desc: "Navigation path display" },
  { name: "Button Group", desc: "Grouped action buttons" },
  { name: "Button", desc: "Interactive buttons" },
  { name: "Calendar", desc: "Date picker calendar" },
  { name: "Card", desc: "Content containers" },
  { name: "Carousel", desc: "Image/content slider" },
  { name: "Chart", desc: "Data visualization" },
  { name: "Checkbox", desc: "Multiple selection input" },
  { name: "Collapsible", desc: "Expandable content" },
  { name: "Command", desc: "Command palette interface" },
  { name: "Context Menu", desc: "Right-click menu" },
  { name: "Dialog", desc: "Modal dialogs" },
  { name: "Drawer", desc: "Side drawer panels" },
  { name: "Dropdown Menu", desc: "Dropdown option menus" },
  { name: "Empty State", desc: "Empty data display" },
  { name: "Field", desc: "Form field wrapper" },
  { name: "Form", desc: "Form management" },
  { name: "Hover Card", desc: "Hover popover content" },
  { name: "Input Group", desc: "Grouped input fields" },
  { name: "Input OTP", desc: "One-time password input" },
  { name: "Input", desc: "Text input field" },
  { name: "Keyboard", desc: "Keyboard key display" },
  { name: "Label", desc: "Form labels" },
  { name: "Menubar", desc: "Application menu bar" },
  { name: "Navigation Menu", desc: "Navigation menu system" },
  { name: "Pagination", desc: "Page navigation" },
  { name: "Popover", desc: "Floating popover content" },
  { name: "Progress", desc: "Progress bar indicator" },
  { name: "Radio Group", desc: "Single option selection" },
  { name: "Resizable", desc: "Resizable panels" },
  { name: "Scroll Area", desc: "Scrollable area" },
  { name: "Select", desc: "Dropdown select field" },
  { name: "Separator", desc: "Visual divider" },
  { name: "Sheet", desc: "Slide-out panel" },
  { name: "Sidebar", desc: "Sidebar navigation" },
  { name: "Skeleton", desc: "Loading placeholder" },
  { name: "Slider", desc: "Range slider input" },
  { name: "Spinner", desc: "Loading spinner" },
  { name: "Switch", desc: "Toggle switch control" },
  { name: "Table", desc: "Data table display" },
  { name: "Tabs", desc: "Tabbed content" },
  { name: "Textarea", desc: "Multi-line text input" },
  { name: "Toggle Group", desc: "Grouped toggle buttons" },
  { name: "Toggle", desc: "Toggle button control" },
  { name: "Tooltip", desc: "Hover help text" },
];

const BuilderComponents = [
  { name: "Form Builder", desc: "Main form builder interface", file: "form-builder.tsx" },
  { name: "Field Canvas", desc: "Drag-drop field canvas", file: "field-canvas.tsx" },
  { name: "Field Inspector", desc: "Field property editor", file: "field-inspector.tsx" },
  { name: "Field Mini Preview", desc: "Field preview component", file: "field-mini-preview.tsx" },
  { name: "Field Palette", desc: "Available fields selector", file: "field-palette.tsx" },
  { name: "Preview Dialog", desc: "Form preview modal", file: "preview-dialog.tsx" },
];

const Pages = [
  { name: "Dashboard", path: "/", desc: "Main dashboard & forms list" },
  { name: "Create Form", path: "/builder", desc: "Create new form page" },
  { name: "Form Builder", path: "/builder/[formId]", desc: "Edit form with builder" },
  { name: "Public Form", path: "/f/[slug]", desc: "Published form display" },
  { name: "Components", path: "/components", desc: "Component showcase (current)" },
];

export default async function Home() {
  let status = "unavailable";
  let forms = [];

  try {
    const result = await api.health.getHealth.query();
    status = result.status;
  } catch {
    status = "unavailable";
  }

  try {
    const formResult = await api.form.getAllMine.query({
      page: 1,
      pageSize: 100,
      includeArchived: false,
    });
    forms = formResult.forms || [];
  } catch (error) {
    console.error("Failed to fetch forms:", error);
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-5xl font-bold text-slate-900 mb-2">Formforge</h1>
          <p className="text-lg text-slate-600 mb-4">
            Complete form builder platform - Built with Next.js, React, and TailwindCSS
          </p>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                status === "healthy" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
              }`}
            >
              Server Status: {status}
            </span>
          </div>
        </div>

        <Tabs defaultValue="forms" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="forms">Your Forms</TabsTrigger>
            <TabsTrigger value="components">UI Components ({UIComponents.length})</TabsTrigger>
            <TabsTrigger value="builder">Builder</TabsTrigger>
            <TabsTrigger value="pages">Pages</TabsTrigger>
          </TabsList>

          {/* Forms Tab */}
          <TabsContent value="forms" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-slate-900">Your Forms</h2>
              <Link href="/builder">
                <Button className="bg-blue-600 hover:bg-blue-700">+ Create New Form</Button>
              </Link>
            </div>

            {forms && forms.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {forms.map((form) => (
                  <Link key={form.id} href={`/builder/${form.id}`}>
                    <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                      <CardHeader>
                        <CardTitle className="text-lg">{form.title}</CardTitle>
                        <CardDescription className="line-clamp-2">
                          {form.description || "No description"}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2 text-sm text-slate-600">
                          <div className="flex justify-between">
                            <span>Fields:</span>
                            <span className="font-medium">{form.fieldCount ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Responses:</span>
                            <span className="font-medium">{form.responseCount ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Views:</span>
                            <span className="font-medium">{form.viewCount ?? 0}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Status:</span>
                            <span className="font-medium capitalize">{form.status}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            ) : (
              <Card className="bg-slate-50 border-dashed">
                <CardContent className="text-center py-12">
                  <p className="text-slate-600 mb-4">
                    No forms yet. Create your first form to get started!
                  </p>
                  <Link href="/builder">
                    <Button>Create Your First Form</Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* UI Components Tab */}
          <TabsContent value="components" className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">UI Components Library</h2>
            <p className="text-slate-600">
              A comprehensive collection of 50+ reusable UI components built with Radix UI and
              TailwindCSS
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {UIComponents.map((comp) => (
                <Card key={comp.name} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-base">{comp.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-slate-600">{comp.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Builder Components Tab */}
          <TabsContent value="builder" className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">Form Builder Components</h2>
            <p className="text-slate-600">
              Advanced components that power the form builder experience
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {BuilderComponents.map((comp) => (
                <Card key={comp.name} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg">{comp.name}</CardTitle>
                    <CardDescription>{comp.file}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-600">{comp.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Pages Tab */}
          <TabsContent value="pages" className="space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">Application Pages</h2>
            <p className="text-slate-600">All pages and routes in the Formforge application</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Pages.map((page) => (
                <Card key={page.path} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg">{page.name}</CardTitle>
                        <CardDescription className="font-mono text-xs mt-1">
                          {page.path}
                        </CardDescription>
                      </div>
                      <Badge variant="outline">{page.path === "/" ? "Home" : "Page"}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-600 mb-4">{page.desc}</p>
                    {page.path !== "/components" && (
                      <Link href={page.path}>
                        <Button variant="outline" size="sm">
                          Visit Page →
                        </Button>
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Features Section */}
        <div className="mt-16 pt-8 border-t border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900 mb-6">Key Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-bold mb-2">Drag & Drop Builder</h3>
                <p className="text-sm text-slate-600">
                  Intuitive form builder with drag-and-drop interface
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-bold mb-2">50+ UI Components</h3>
                <p className="text-sm text-slate-600">
                  Comprehensive component library for all needs
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-bold mb-2">Responsive Design</h3>
                <p className="text-sm text-slate-600">Mobile-first approach with TailwindCSS</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <h3 className="font-bold mb-2">Real-time Feedback</h3>
                <p className="text-sm text-slate-600">Instant preview and response tracking</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </main>
  );
}
