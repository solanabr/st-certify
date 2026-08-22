import { ImageResponse } from "next/og";

// Branded link-preview card (also used as the Twitter image). Static, no
// external font fetch — satori's default sans renders the wordmark cleanly.
// Every container sets display:flex (satori requires it on multi-child nodes).

export const alt =
  "Superteam Certify — Certificados on-chain da Superteam Brasil";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#11160f",
        padding: "84px",
        color: "#f5e8ca",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
        <div
          style={{
            width: 16,
            height: 16,
            borderRadius: 99,
            background: "#0aa25a",
          }}
        />
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 6,
            color: "#0aa25a",
          }}
        >
          DEVNET · SOLANA
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
        <div style={{ display: "flex", fontSize: 78, fontWeight: 700 }}>
          Certificados on-chain
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 78,
            fontWeight: 700,
            color: "#0aa25a",
          }}
        >
          da Superteam Brasil
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 34,
            color: "#b8bdb6",
            marginTop: "12px",
          }}
        >
          Assinados por quem responde pelo curso, verificáveis por qualquer
          pessoa.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          fontSize: 32,
          fontWeight: 600,
        }}
      >
        <div style={{ display: "flex" }}>Superteam</div>
        <div style={{ display: "flex", color: "#ffd23f" }}>Certify</div>
      </div>
    </div>,
    { ...size },
  );
}
