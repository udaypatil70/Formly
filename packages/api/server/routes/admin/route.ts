import { router } from "../../trpc";
import { adminFormProcedures } from "./forms";
import { adminTemplateProcedures } from "./templates";
import { adminUserProcedures } from "./users";

export {
  assertNoPublishedForms,
  assertNotLastAdmin,
  assertNotSelf,
} from "./guards";

/**
 * Admin surface, split by resource so each file stays readable as it grows:
 *
 *   users.ts     account state, roles, plans, suspension, deletion
 *   forms.ts     moderation, featuring, explore contents, platform stats
 *   templates.ts template authoring and publication
 *   guards.ts    invariants that must hold for every mutation
 *   schemas.ts   shared inputs/outputs
 */
export const adminRouter = router({
  ...adminUserProcedures,
  ...adminFormProcedures,
  ...adminTemplateProcedures,
});
