import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";
import { authRouter } from "./routes/auth/route";
import { formRouter } from "./routes/form/route";
import { fieldRouter } from "./routes/field/route";
import { responseRouter } from "./routes/response/route";
import { analyticsRouter } from "./routes/analytics/route";
import { publicRouter } from "./routes/public/route";
import { themeRouter } from "./routes/theme/route";
import { adminRouter } from "./routes/admin/route";
import { templateRouter } from "./routes/template/route";
import { webhookRouter } from "./routes/webhook/route";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
  form: formRouter,
  field: fieldRouter,
  response: responseRouter,
  analytics: analyticsRouter,
  public: publicRouter,
  theme: themeRouter,
  admin: adminRouter,
  template: templateRouter,
  webhook: webhookRouter,
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;