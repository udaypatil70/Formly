import { httpLink, httpBatchStreamLink } from "@repo/api/client";

import { getVisitorId } from "~/lib/visitor";

const configuredApiUrl: string = import.meta.env.VITE_API_URL ?? "/trpc";
const normalizedApiUrl = configuredApiUrl.replace(/\/+$/, "");
const API_URL = normalizedApiUrl.endsWith("/trpc")
  ? normalizedApiUrl
  : `${normalizedApiUrl}/trpc`;

interface CreateTRPCHttpBatchClientClientOpts {
  enableStreaming?: boolean;
}

export const createTRPCHttpBatchClientClient = (opts?: CreateTRPCHttpBatchClientClientOpts) => {
  const c = opts?.enableStreaming ? httpBatchStreamLink : httpLink;
  return c({
    url: API_URL,
    headers() {
      const visitorId = getVisitorId();
      return visitorId ? { "x-formly-visitor": visitorId } : {};
    },
    fetch(url, options) {
      return fetch(url, {
        ...options,
        credentials: "include",
      });
    },
  });
};
