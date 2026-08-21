// Share-target URL builders for the claim ceremony's done state. Kept out of
// the .tsx so they are unit-testable (vitest runs in a node env with no JSX
// transform), same split as components/verify/verify-outcome.ts.

/**
 * WhatsApp's click-to-chat entry point with no recipient: it opens the contact
 * picker with the message prefilled. Text and link travel in one `text` param —
 * WhatsApp linkifies the trailing URL itself.
 */
export function whatsappShareUrl(message: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${message} ${url}`)}`;
}

/** LinkedIn's share-offsite endpoint. It reads the page's own OG tags, so only the URL travels. */
export function linkedinShareUrl(url: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
}

/**
 * The absolute verify link for a certificate. Falls back to the bare path
 * during SSR, where there is no origin to prefix and nothing is shareable yet.
 */
export function verifyUrl(origin: string | undefined, address: string): string {
  const path = `/verify/${address}`;
  return origin ? `${origin}${path}` : path;
}
