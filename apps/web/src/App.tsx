import { Route, Routes } from "react-router-dom";

import { DashboardShell } from "~/components/dashboard/dashboard-shell";
import { RequireAuth } from "~/components/dashboard/require-auth";
import { MyFormsDashboard } from "~/components/dashboard/my-forms-dashboard";
import { AdminShell } from "~/components/admin/admin-shell";
import { RequireAdmin } from "~/components/admin/require-admin";
import { AnalyticsPage } from "~/pages/analytics-page";
import { CreateFormPage } from "~/pages/create-form-page";
import { FormBuilderPage } from "~/pages/form-builder-page";
import { PublicFormPage } from "~/pages/public-form-page";
import { ResponsesPage } from "~/pages/responses-page";
import { LoginPage } from "~/pages/login-page";
import { LandingPage } from "~/pages/landing-page";
import { PricingPage } from "~/pages/pricing-page";
import { DocsPage } from "~/pages/docs-page";
import { ExplorePage } from "~/pages/explore-page";
import { AdminOverviewPage } from "~/pages/admin/admin-overview-page";
import { AdminUsersPage } from "~/pages/admin/admin-users-page";
import { AdminFormsPage } from "~/pages/admin/admin-forms-page";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/explore" element={<ExplorePage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/f/:slug" element={<PublicFormPage />} />
      <Route path="/form/:slug" element={<PublicFormPage />} />
      <Route element={<DashboardShell />}>
        <Route path="/dashboard" element={<MyFormsDashboard />} />
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
  );
}

function NotFoundPage() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-2">
      <p className="text-sm text-muted-foreground">Page not found</p>
      <a className="text-sm text-foreground underline" href="/">
        Go home
      </a>
    </div>
  );
}