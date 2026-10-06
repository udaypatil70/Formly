import { httpLink, httpBatchStreamLink } from "@repo/api/client";

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
    fetch(url, options) {
      return fetch(url, {
        ...options,
        credentials: "include",
      });
    },
  });
};
