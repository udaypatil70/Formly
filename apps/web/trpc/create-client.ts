import { httpLink, httpBatchStreamLink } from "@repo/api/client";

import { getApiOrigin } from "~/lib/api-origin";
import { getVisitorId } from "~/lib/visitor";

const API_URL = `${getApiOrigin()}/trpc`;

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
