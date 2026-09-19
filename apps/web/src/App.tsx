import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { DashboardShell } from "~/components/dashboard/dashboard-shell";
import { RequireAuth } from "~/components/dashboard/require-auth";
import { MyFormsDashboard } from "~/components/dashboard/my-forms-dashboard";
import { AdminShell } from "~/components/admin/admin-shell";
import { RequireAdmin } from "~/components/admin/require-admin";
import { Spinner } from "~/components/ui/spinner";

const LoginPage = lazy(() =>
  import("~/pages/login-page").then((m) => ({ default: m.LoginPage })),
);
const LandingPage = lazy(() =>
  import("~/pages/landing-page").then((m) => ({ default: m.LandingPage })),
);
const PricingPage = lazy(() =>
  import("~/pages/pricing-page").then((m) => ({ default: m.PricingPage })),
);
const DocsPage = lazy(() =>
  import("~/pages/docs-page").then((m) => ({ default: m.DocsPage })),
);
const ExplorePage = lazy(() =>
  import("~/pages/explore-page").then((m) => ({ default: m.ExplorePage })),
);
const TemplatesPage = lazy(() =>
  import("~/pages/templates-page").then((m) => ({ default: m.TemplatesPage })),
);
const PublicFormPage = lazy(() =>
  import("~/pages/public-form-page").then((m) => ({
    default: m.PublicFormPage,
  })),
);
const ResponsesPage = lazy(() =>
  import("~/pages/responses-page").then((m) => ({ default: m.ResponsesPage })),
);
const ProfilePage = lazy(() =>
  import("~/pages/profile-page").then((m) => ({ default: m.ProfilePage })),
);
const AnalyticsPage = lazy(() =>
  import("~/pages/analytics-page").then((m) => ({ default: m.AnalyticsPage })),
);
const CreateFormPage = lazy(() =>
  import("~/pages/create-form-page").then((m) => ({ default: m.CreateFormPage })),
);
const FormBuilderPage = lazy(() =>
  import("~/pages/form-builder-page").then((m) => ({
    default: m.FormBuilderPage,
  })),
);
const AdminOverviewPage = lazy(() =>
  import("~/pages/admin/admin-overview-page").then((m) => ({
    default: m.AdminOverviewPage,
  })),
);
const AdminUsersPage = lazy(() =>
  import("~/pages/admin/admin-users-page").then((m) => ({
    default: m.AdminUsersPage,
  })),
);
const AdminFormsPage = lazy(() =>
  import("~/pages/admin/admin-forms-page").then((m) => ({
    default: m.AdminFormsPage,
  })),
);
const NotFoundPage = lazy(() =>
  import("~/pages/not-found-page").then((m) => ({ default: m.NotFoundPage })),
);

export function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/explore" element={<ExplorePage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/f/:slug" element={<PublicFormPage />} />
        <Route path="/form/:slug" element={<PublicFormPage />} />
        <Route element={<DashboardShell />}>
          <Route path="/dashboard" element={<MyFormsDashboard />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/responses/:formId" element={<ResponsesPage />} />
          <Route path="/analytics/:formId" element={<AnalyticsPage />} />
        </Route>
        <Route element={<RequireAdmin><AdminShell /></RequireAdmin>}>
          <Route path="/admin" element={<AdminOverviewPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/forms" element={<AdminFormsPage />} />
        </Route>
        <Route
          path="/builder"
          element={
            <RequireAuth>
              <CreateFormPage />
            </RequireAuth>
          }
        />
        <Route
          path="/builder/:formId"
          element={
            <RequireAuth>
              <FormBuilderPage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}

function PageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}