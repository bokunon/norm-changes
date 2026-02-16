// .env の ${DB_PASSWORD} 等を展開（Next.js が process.env を読む前に実行）
import dotenv from "dotenv";
import { expand } from "dotenv-expand";
expand(dotenv.config());

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
};

export default nextConfig;
