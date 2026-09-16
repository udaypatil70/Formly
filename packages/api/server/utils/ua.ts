export type DeviceCategory = "desktop" | "mobile" | "tablet";
export type BrowserName = "chrome" | "safari" | "firefox" | "edge" | "other";

export function parseUserAgent(
  userAgent?: string | null,
): { device: DeviceCategory; browser: BrowserName } {
  const lower = (userAgent ?? "").toLowerCase();

  let device: DeviceCategory = "desktop";
  if (/ipad|tablet|playbook|silk|kindle|nexus\s*7/.test(lower)) {
    device = "tablet";
  } else if (/iphone|ipod|android|blackberry|windows\s*phone|mobile|opera\s*mini|iemobile/.test(lower)) {
    device = "mobile";
  }

  let browser: BrowserName = "other";
  if (/edg(e|ios|a)?\//.test(lower)) {
    browser = "edge";
  } else if (/crios|crmo|opr\/|chrome|chromium/.test(lower)) {
    browser = "chrome";
  } else if (/firefox|fxios/.test(lower)) {
    browser = "firefox";
  } else if (/safari|version\//.test(lower)) {
    browser = "safari";
  }

  return { device, browser };
}