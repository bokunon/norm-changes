// .env の ${DB_PASSWORD} 等を展開してから Prisma が読むようにする
import dotenv from "dotenv";
import { expand } from "dotenv-expand";
expand(dotenv.config());

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // マイグレーション用: DIRECT_DATABASE_URL が有効な postgres(ql):// URL なら使用、それ以外は DATABASE_URL
  // （空や不正な文字列だと P1013 が出るため、スキームをチェックしてフォールバック）
  datasource: {
    url: (() => {
      const direct = process.env.DIRECT_DATABASE_URL?.trim();
      if (direct && /^postgres(ql)?:\/\//i.test(direct)) return direct;
      return env("DATABASE_URL");
    })(),
  },
});
