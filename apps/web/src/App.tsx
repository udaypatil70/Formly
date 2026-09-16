import { Route, Routes } from "react-router-dom";

import { DashboardShell } from "~/components/dashboard/dashboard-shell";
import { RequireAuth } from "~/components/dashboard/require-auth";
import { MyFormsDashboard } from "~/components/dashboard/my-forms-dashboard";
import { CreateFormPage } from "~/pages/create-form-page";
import { FormBuilderPage } from "~/pages/form-builder-page";
import { PublicFormPage } from "~/pages/public-form-page";
import { ResponsesPage } from "~/pages/responses-page";
import { LoginPage } from "~/pages/login-page";

export function App() {
  return (
    <Routes>
      <Route element={<DashboardShell />}>
        <Route index element={<MyFormsDashboard />} />
        <Route path="/responses/:formId" element={<ResponsesPage />} />
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
      <Route path="/f/:slug" element={<PublicFormPage />} />
      <Route path="/login" element={<LoginPage />} />
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