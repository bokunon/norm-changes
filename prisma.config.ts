// .env を読み込む（Issue #26: 接続文字列をそのまま DATABASE_URL / DIRECT_DATABASE_URL に設定するため expand 不要）
import dotenv from "dotenv";
dotenv.config();

import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // マイグレーション用: DIRECT_DATABASE_URL が有効な postgres(ql):// URL なら使用、それ以外は DATABASE_URL
  // （空や不正な文字列だと P1013 が出るため、スキームをチェックしてフォールバック）
  // CI の postinstall（prisma generate）では DB に接続しないため、未設定時はプレースホルダー URL を使用
  datasource: {
    url: (() => {
      const direct = process.env.DIRECT_DATABASE_URL?.trim();
      if (direct && /^postgres(ql)?:\/\//i.test(direct)) return direct;
      const dbUrl = process.env.DATABASE_URL?.trim();
      if (dbUrl && /^postgres(ql)?:\/\//i.test(dbUrl)) return dbUrl;
      // prisma generate 用のダミー（接続しない）
      return "postgresql://localhost:5432/prisma_generate_placeholder";
    })(),
  },
});
