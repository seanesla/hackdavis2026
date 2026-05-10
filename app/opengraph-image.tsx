import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "parcel — site planning for community builders. AI-driven 3D site plans, no CAD required.";

export default function OGImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 88px",
          background: "#0b0b0c",
          color: "#f5f5f4",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          backgroundImage:
            "radial-gradient(circle at 80% 0%, rgba(232,184,109,0.18), transparent 55%), radial-gradient(circle at 0% 100%, rgba(232,184,109,0.08), transparent 50%)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 14,
              height: 14,
              borderRadius: 999,
              background: "#e8b86d",
            }}
          />
          <span
            style={{
              fontSize: 22,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: "#a3a3a3",
            }}
          >
            parcel
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 96,
              lineHeight: 1.05,
              fontWeight: 700,
              letterSpacing: -2,
              color: "#f5f5f4",
              maxWidth: 1000,
            }}
          >
            describe a site. parcel plans it.
          </div>
          <div
            style={{
              width: 280,
              height: 4,
              background:
                "linear-gradient(90deg, rgba(232,184,109,0) 0%, #e8b86d 12%, #e8b86d 88%, rgba(232,184,109,0) 100%)",
              borderRadius: 2,
            }}
          />
          <div
            style={{
              fontSize: 30,
              color: "#d4d4d8",
              lineHeight: 1.35,
              maxWidth: 980,
            }}
          >
            Free AI site planning for nonprofits, community developers, and
            small teams. No CAD required.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            color: "#a3a3a3",
            fontSize: 18,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          <span>built for community builders</span>
          <span style={{ color: "#e8b86d" }}>v1 · alpha</span>
        </div>
      </div>
    ),
    size,
  );
}
