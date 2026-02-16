// .env を読み込む（Issue #26: 接続文字列をそのまま設定するため expand 不要）
import dotenv from "dotenv";
dotenv.config();

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
