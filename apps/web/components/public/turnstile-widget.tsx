import { useEffect, useRef } from "react";

interface TurnstileApi {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

interface TurnstileWidgetProps {
  siteKey: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
}

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

/**
 * Cloudflare Turnstile widget loaded lazily from Cloudflare's CDN.
 * Renders nothing when `siteKey` is empty (protection disabled).
 */
export function TurnstileWidget({
  siteKey,
  onToken,
  onExpire,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const tokenRef = useRef(onToken);
  const expireRef = useRef(onExpire);

  useEffect(() => {
    tokenRef.current = onToken;
    expireRef.current = onExpire;
  }, [onToken, onExpire]);

  useEffect(() => {
    if (!siteKey) return;
    let cancelled = false;

    const renderWidget = () => {
      if (cancelled || !window.turnstile || !containerRef.current) return;
      if (widgetIdRef.current !== undefined) return;
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "auto",
        callback: (token: string) => tokenRef.current(token),
        "expired-callback": () => {
          tokenRef.current("");
          expireRef.current?.();
        },
        "error-callback": () => tokenRef.current(""),
      });
    };

    if (window.turnstile) {
      renderWidget();
    } else {
      const existing = document.getElementById(
        "cf-turnstile-script",
      ) as HTMLScriptElement | null;
      const script =
        existing ??
        (() => {
          const s = document.createElement("script");
          s.id = "cf-turnstile-script";
          s.src = SCRIPT_SRC;
          s.async = true;
          s.defer = true;
          document.head.appendChild(s);
          return s;
        })();

      script.addEventListener("load", renderWidget);
    }

    return () => {
      cancelled = true;
      widgetIdRef.current = undefined;
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} className="[&>div]:mx-auto" />;
}