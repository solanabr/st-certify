import { describe, expect, it } from "vitest";
import { linkedinShareUrl, verifyUrl, whatsappShareUrl } from "../share-links";

const VERIFY = "https://certify.test/verify/Cert111";

describe("share targets", () => {
  it("puts the message and the link in one encoded WhatsApp param", () => {
    const url = new URL(whatsappShareUrl("Meu certificado — Rust 101", VERIFY));

    expect(url.origin + url.pathname).toBe("https://wa.me/");
    expect(url.searchParams.get("text")).toBe(
      `Meu certificado — Rust 101 ${VERIFY}`,
    );
  });

  it("sends only the URL to LinkedIn, which reads the page's own preview tags", () => {
    const url = new URL(linkedinShareUrl(VERIFY));

    expect(url.origin + url.pathname).toBe(
      "https://www.linkedin.com/sharing/share-offsite/",
    );
    expect(url.searchParams.get("url")).toBe(VERIFY);
  });
});

describe("verifyUrl", () => {
  it("absolutizes against the page origin", () => {
    expect(verifyUrl("https://certify.test", "Cert111")).toBe(VERIFY);
  });

  it("degrades to the bare path during SSR", () => {
    expect(verifyUrl(undefined, "Cert111")).toBe("/verify/Cert111");
  });
});
