// .env を読み込む（Issue #26: 接続文字列をそのまま設定するため expand 不要）
import dotenv from "dotenv";
dotenv.config();

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Issue #117: ビルド時の日付をクライアントに公開（フッター表示用）
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString().slice(0, 10),
  },
  async headers() {
    const securityHeaders = [
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value: "camera=(), microphone=(), geolocation=()",
      },
    ];
    return [
      // API ルートはキャッシュしない（Issue #89）
      {
        source: "/api/:path*",
        headers: [
          ...securityHeaders,
          { key: "Cache-Control", value: "no-store, max-age=0" },
        ],
      },
      { source: "/:path*", headers: securityHeaders },
    ];
  },
};

export default nextConfig;
