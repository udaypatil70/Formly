export interface RazorpaySubscriptionHandlerResponse {
  razorpay_payment_id: string;
  razorpay_subscription_id: string;
  razorpay_signature: string;
}

export interface RazorpayCheckoutOptions {
  key: string;
  subscription_id: string;
  name: string;
  description?: string;
  image?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySubscriptionHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayConstructor {
  new (options: RazorpayCheckoutOptions): { open(): void };
}

let checkoutScriptPromise: Promise<RazorpayConstructor> | null = null;

function getRazorpayGlobal(): RazorpayConstructor | undefined {
  return (window as { Razorpay?: RazorpayConstructor }).Razorpay;
}

/** Loads the Razorpay Checkout script once and resolves with the constructor. */
export function loadRazorpayCheckout(): Promise<RazorpayConstructor> {
  if (checkoutScriptPromise) return checkoutScriptPromise;
  checkoutScriptPromise = new Promise<RazorpayConstructor>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Payment is unavailable"));
      return;
    }
    const existing = getRazorpayGlobal();
    if (existing) {
      resolve(existing);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      const ctor = getRazorpayGlobal();
      if (ctor) resolve(ctor);
      else reject(new Error("Razorpay failed to initialise"));
    };
    script.onerror = () => {
      checkoutScriptPromise = null;
      reject(new Error("Could not load the payment gateway"));
    };
    document.body.appendChild(script);
  });
  return checkoutScriptPromise;
}