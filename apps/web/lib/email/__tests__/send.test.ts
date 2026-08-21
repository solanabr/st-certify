import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn(async () => ({
  data: { id: "email-1" },
  error: null as { message: string } | null,
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

/**
 * Fresh module per test: `sendEmail` warns exactly once per process when the
 * provider is unconfigured, and that latch is module state.
 */
async function loadSend() {
  vi.resetModules();
  return import("../send");
}

const PAYLOAD = {
  signerName: "João",
  editionName: "Turma A",
  inviteUrl: "https://certify.test/invite/abc",
};

beforeEach(() => {
  send.mockClear();
  send.mockResolvedValue({ data: { id: "email-1" }, error: null });
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "Certify <no-reply@certify.test>");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("emailConfigured", () => {
  it("needs both the api key and the from address", async () => {
    const { emailConfigured } = await loadSend();
    expect(emailConfigured()).toBe(true);

    vi.stubEnv("EMAIL_FROM", "");
    expect(emailConfigured()).toBe(false);

    vi.stubEnv("EMAIL_FROM", "Certify <no-reply@certify.test>");
    vi.stubEnv("RESEND_API_KEY", "");
    expect(emailConfigured()).toBe(false);
  });
});

describe("sendEmail", () => {
  it("skips and warns once when the provider is unconfigured", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("RESEND_API_KEY", "");
    const { sendEmail } = await loadSend();

    const first = await sendEmail(
      "signer@example.test",
      "signer-invite",
      "pt-BR",
      PAYLOAD,
    );
    const second = await sendEmail(
      "other@example.test",
      "signer-invite",
      "pt-BR",
      PAYLOAD,
    );

    expect(first).toEqual({ sent: false, reason: "unconfigured" });
    expect(second).toEqual({ sent: false, reason: "unconfigured" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("hands the rendered email to the provider", async () => {
    const { sendEmail } = await loadSend();

    const result = await sendEmail(
      "signer@example.test",
      "signer-invite",
      "pt-BR",
      PAYLOAD,
    );

    expect(result).toEqual({ sent: true });
    expect(send).toHaveBeenCalledTimes(1);
    const [payload] = send.mock.calls[0] as unknown as [
      { from: string; to: string; subject: string; html: string; text: string },
    ];
    expect(payload.from).toBe("Certify <no-reply@certify.test>");
    expect(payload.to).toBe("signer@example.test");
    expect(payload.subject).toContain("Turma A");
    expect(payload.html).toContain("<!DOCTYPE html>");
    expect(payload.text).toContain("https://certify.test/invite/abc");
  });

  it("reports a provider error without throwing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockResolvedValue({
      data: null as unknown as { id: string },
      error: { message: "domain is not verified" },
    });
    const { sendEmail } = await loadSend();

    const result = await sendEmail(
      "signer@example.test",
      "signer-invite",
      "pt-BR",
      PAYLOAD,
    );

    expect(result).toEqual({ sent: false, reason: "domain is not verified" });
  });

  it("swallows a thrown provider failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    send.mockRejectedValue(new Error("network down"));
    const { sendEmail } = await loadSend();

    await expect(
      sendEmail("signer@example.test", "signer-invite", "pt-BR", PAYLOAD),
    ).resolves.toEqual({ sent: false, reason: "network down" });
  });

  it("refuses an empty recipient", async () => {
    const { sendEmail } = await loadSend();

    const result = await sendEmail("  ", "signer-invite", "pt-BR", PAYLOAD);

    expect(result).toEqual({ sent: false, reason: "no-recipient" });
    expect(send).not.toHaveBeenCalled();
  });
});
