import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BatchDone } from "../batch-done";
import type { BatchSummary } from "../ceremony";

const EDITION_A = "Ed1t10nA1111111111111111111111111111111111";
const EDITION_B = "Ed1t10nB2222222222222222222222222222222222";

function summary(over: Partial<BatchSummary> = {}): BatchSummary {
  return {
    signed: 4,
    failed: 0,
    editions: [
      {
        editionAddress: EDITION_A,
        editionName: "Turma 2026",
        signed: 3,
        failed: 0,
      },
      {
        editionAddress: EDITION_B,
        editionName: "Bootcamp Solana",
        signed: 1,
        failed: 0,
      },
    ],
    ...over,
  };
}

function render(value: BatchSummary, showEditionLinks = false): string {
  return renderToStaticMarkup(
    <BatchDone
      summary={value}
      showEditionLinks={showEditionLinks}
      onDismiss={() => {}}
    />,
  );
}

describe("BatchDone", () => {
  it("reports the signed total and the per-edition split", () => {
    const html = render(summary());

    expect(html).toContain("4 certificados assinados");
    expect(html).toContain("3 em Turma 2026");
    expect(html).toContain("1 em Bootcamp Solana");
  });

  it("uses the singular title for a batch of one", () => {
    const html = render(
      summary({
        signed: 1,
        editions: [
          {
            editionAddress: EDITION_A,
            editionName: "Turma 2026",
            signed: 1,
            failed: 0,
          },
        ],
      }),
    );

    expect(html).toContain("1 certificado assinado");
    expect(html).not.toContain("certificados assinados");
  });

  /**
   * A partial run must not read as a success. The failures are the actionable
   * half — those rows are still in the queue below waiting on this signer.
   */
  it("leads with both columns when part of the batch failed", () => {
    const html = render(
      summary({
        signed: 2,
        failed: 2,
        editions: [
          {
            editionAddress: EDITION_A,
            editionName: "Turma 2026",
            signed: 2,
            failed: 1,
          },
          {
            editionAddress: EDITION_B,
            editionName: "Bootcamp Solana",
            signed: 0,
            failed: 1,
          },
        ],
      }),
    );

    expect(html).toContain("2 assinados");
    expect(html).toContain("2 não concluídos");
    expect(html).not.toContain("certificados assinados");
    // An edition where nothing landed has nothing to report.
    expect(html).not.toContain("Bootcamp Solana");
  });

  it("says plainly when nothing reached the blockchain", () => {
    const html = render(
      summary({
        signed: 0,
        failed: 4,
        editions: [
          {
            editionAddress: EDITION_A,
            editionName: "Turma 2026",
            signed: 0,
            failed: 4,
          },
        ],
      }),
    );

    expect(html).toContain("Nenhuma assinatura concluída");
    expect(html).toContain("Nada foi registrado na blockchain");
  });

  it("keeps the studio pipeline links out of a plain signer's view", () => {
    expect(render(summary(), false)).not.toContain("/studio/editions/");

    const asAdmin = render(summary(), true);
    expect(asAdmin).toContain(`/studio/editions/${EDITION_A}`);
    expect(asAdmin).toContain(`/studio/editions/${EDITION_B}`);
  });

  it("announces itself politely rather than stealing focus", () => {
    expect(render(summary())).toContain('aria-live="polite"');
  });
});
