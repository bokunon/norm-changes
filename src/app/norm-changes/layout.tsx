import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "法令変更・インパクト一覧 | 法令変更アラート",
};

export default function NormChangesLayout({
  children,
}: { children: React.ReactNode }) {
  return children;
}
