import { describe, expect, it } from "vitest";
import type { InviteView } from "@/lib/invite/view";
import { inviteStage, isDeadEnd, type InviteStage } from "../invite-state";

const WALLET = "AwaLLet11111111111111111111111111111111111";

function view(over: Partial<InviteView> = {}): InviteView {
  return {
    seatId: "22222222-2222-4222-8222-222222222222",
    name: "Ana Beatriz",
    role: "Coordenadora",
    status: "invited",
    editionName: "Turma 2026",
    wallet: null,
    invitedAt: "2026-08-20T00:00:00Z",
    frozen: false,
    issuer: null,
    ...over,
  };
}

describe("inviteStage", () => {
  it("sends an unknown token straight to the dead-state", () => {
    expect(
      inviteStage({ invite: null, authenticated: true, wallets: [WALLET] }),
    ).toBe("notFound");
  });

  it("asks a logged-out visitor to sign in on a live seat", () => {
    expect(
      inviteStage({ invite: view(), authenticated: false, wallets: [] }),
    ).toBe("login");
  });

  it("offers wallet creation to a signed-in visitor with nothing linked", () => {
    expect(
      inviteStage({ invite: view(), authenticated: true, wallets: [] }),
    ).toBe("createWallet");
  });

  it("offers the choice once a wallet exists", () => {
    expect(
      inviteStage({ invite: view(), authenticated: true, wallets: [WALLET] }),
    ).toBe("chooseWallet");
  });

  it("shows the confirmation again when the seat is already bound", () => {
    expect(
      inviteStage({
        invite: view({ status: "accepted", wallet: WALLET }),
        authenticated: true,
        wallets: [WALLET],
      }),
    ).toBe("accepted");
  });

  it("closes a seat whose edition already went on-chain", () => {
    expect(
      inviteStage({
        invite: view({ frozen: true }),
        authenticated: true,
        wallets: [WALLET],
      }),
    ).toBe("closed");
  });

  /**
   * The ordering that matters: asking someone to log in and only then telling
   * them the link was dead all along wastes the one action they can take.
   */
  it("reports a dead link before asking anyone to log in", () => {
    for (const invite of [
      view({ status: "expired" }),
      view({ frozen: true }),
      null,
    ]) {
      const stage = inviteStage({ invite, authenticated: false, wallets: [] });
      expect(isDeadEnd(stage)).toBe(true);
    }
  });

  it("keeps an accepted seat readable even after the edition is created", () => {
    expect(
      inviteStage({
        invite: view({ status: "accepted", wallet: WALLET, frozen: true }),
        authenticated: true,
        wallets: [WALLET],
      }),
    ).toBe("accepted");
  });
});

describe("isDeadEnd", () => {
  it.each<InviteStage>(["notFound", "expired", "closed"])(
    "%s has no next step",
    (stage) => {
      expect(isDeadEnd(stage)).toBe(true);
    },
  );

  it.each<InviteStage>(["accepted", "login", "chooseWallet", "createWallet"])(
    "%s still leads somewhere",
    (stage) => {
      expect(isDeadEnd(stage)).toBe(false);
    },
  );
});
