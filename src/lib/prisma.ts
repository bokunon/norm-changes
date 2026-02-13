// PrismaClient のシングルトンを提供するユーティリティ
// Next.js (開発環境) では HMR によりモジュールが再評価されるため、
// globalThis にインスタンスを保持して使い回します。
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// 型拡張: globalThis に prisma をぶら下げる
// eslint-disable-next-line no-var, @typescript-eslint/no-explicit-any
declare global {
  // eslint-disable-next-line no-var, @typescript-eslint/no-explicit-any
  var prisma: PrismaClient | undefined;
}

// Prisma 7 ではクライアント側は adapter 経由で接続文字列を受け取る
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL が設定されていません。`.env` を確認してください。");
}

const adapter = new PrismaPg({
  connectionString,
});

// 本番環境では毎回新しいインスタンス、開発環境では globalThis を使い回し
const prisma = globalThis.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.prisma = prisma;
}

export { prisma };

