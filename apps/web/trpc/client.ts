import { createTRPCReact } from "@trpc/react-query";
import { ServerRouter } from "@repo/api/client";

export const trpc = createTRPCReact<ServerRouter>();
