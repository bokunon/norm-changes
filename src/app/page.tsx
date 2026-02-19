/**
 * Issue #13: トップは法令インパクト一覧にリダイレクトする。
 * DB接続確認・アーキテクチャ概要は一覧ページのナビからサブとして参照する。
 */
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/norm-changes");
}
