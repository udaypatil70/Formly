import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";
import { authRouter } from "./routes/auth/route";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
});

export { createContext } from "./context";
export type ServerRouter = typeof serverRouter;
