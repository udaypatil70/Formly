import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";
import { authRouter } from "./routes/auth/route";
import { formRouter } from "./routes/form/route";
import { fieldRouter } from "./routes/field/route";
import { responseRouter } from "./routes/response/route";
import { analyticsRouter } from "./routes/analytics/route";
import { publicRouter } from "./routes/public/route";
import { themeRouter } from "./routes/theme/route";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
  form: formRouter,
  field: fieldRouter,
  response: responseRouter,
  analytics: analyticsRouter,
  public: publicRouter,
  theme: themeRouter,
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;