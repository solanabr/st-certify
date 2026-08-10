import { notFound } from "next/navigation";
import { DesignerPreviewClient } from "./designer-preview-client";

/**
 * Dev-only harness for exercising the M6 template designer without a full
 * Privy admin login (email-OTP can't be automated headless). Mirrors
 * `app/api/dev/render-sample`'s guard pattern. 404s outside development —
 * never reachable in a production build.
 */
export default function DesignerPreviewPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }
  return <DesignerPreviewClient />;
}
