/**
 * Issue #104: risk-keyword-fallback.ts のユニットテスト
 */
import { describe, it, expect } from "vitest";
import {
  detectRiskByKeywords,
  findAllKeywordsInText,
  generatePenaltyDetailForFallback,
} from "@/lib/risk-keyword-fallback";

describe("detectRiskByKeywords", () => {
  it("null または空文字のとき null を返す", () => {
    expect(detectRiskByKeywords(null)).toBeNull();
    expect(detectRiskByKeywords(undefined)).toBeNull();
    expect(detectRiskByKeywords("")).toBeNull();
    expect(detectRiskByKeywords("   ")).toBeNull();
  });

  it("survival キーワード: 業務停止 を検出", () => {
    expect(detectRiskByKeywords("第5条 業務停止を命じることができる")).toBe("survival");
  });

  it("survival キーワード: 免許取消 を検出", () => {
    expect(detectRiskByKeywords("免許取消の処分を受けた場合")).toBe("survival");
  });

  it("survival キーワード: 登録取消 を検出", () => {
    expect(detectRiskByKeywords("登録取消の規定が適用される")).toBe("survival");
  });

  it("survival キーワード: 許可取消 を検出", () => {
    expect(detectRiskByKeywords("許可取消をすることができる")).toBe("survival");
  });

  it("survival キーワード: 営業停止 を検出", () => {
    expect(detectRiskByKeywords("営業停止処分を命ずることができる")).toBe("survival");
  });

  it("survival キーワード: 事業停止 を検出", () => {
    expect(detectRiskByKeywords("事業停止を命令する")).toBe("survival");
  });

  it("survival キーワード: 指定取消 を検出", () => {
    expect(detectRiskByKeywords("指定取消の処分を行う")).toBe("survival");
  });

  it("financial キーワード: 罰金 を検出", () => {
    expect(detectRiskByKeywords("百万円以下の罰金に処する")).toBe("financial");
  });

  it("financial キーワード: 課徴金 を検出", () => {
    expect(detectRiskByKeywords("課徴金を納付しなければならない")).toBe("financial");
  });

  it("financial キーワード: 過料 を検出", () => {
    expect(detectRiskByKeywords("過料に処する")).toBe("financial");
  });

  it("financial キーワード: 納付金 を検出", () => {
    expect(detectRiskByKeywords("納付金を徴収する")).toBe("financial");
  });

  it("financial キーワード: 科料 を検出", () => {
    expect(detectRiskByKeywords("科料を科す")).toBe("financial");
  });

  it("credit キーワード: 社名公表 を検出", () => {
    expect(detectRiskByKeywords("社名公表することができる")).toBe("credit");
  });

  it("credit キーワード: 氏名公表 を検出", () => {
    expect(detectRiskByKeywords("氏名公表の措置を取る")).toBe("credit");
  });

  it("credit キーワード: 勧告 を検出", () => {
    expect(detectRiskByKeywords("勧告を行うことができる")).toBe("credit");
  });

  it("credit キーワード: 警告 を検出", () => {
    expect(detectRiskByKeywords("警告を発することができる")).toBe("credit");
  });

  it("該当キーワードがないとき null を返す", () => {
    expect(detectRiskByKeywords("届出様式の変更に関する規定")).toBeNull();
    expect(detectRiskByKeywords("手続きの方法を変更する規定")).toBeNull();
  });

  it("survival と financial が共存するとき survival（厳しい方）を返す", () => {
    expect(detectRiskByKeywords("業務停止または罰金")).toBe("survival");
  });

  it("financial と credit が共存するとき financial（厳しい方）を返す", () => {
    expect(detectRiskByKeywords("罰金または社名公表")).toBe("financial");
  });
});

describe("findAllKeywordsInText", () => {
  it("null または空文字のとき空配列を返す", () => {
    expect(findAllKeywordsInText(null)).toEqual([]);
    expect(findAllKeywordsInText(undefined)).toEqual([]);
    expect(findAllKeywordsInText("")).toEqual([]);
  });

  it("survival キーワードを検出する", () => {
    const result = findAllKeywordsInText("業務停止または免許取消を命じることができる");
    expect(result).toContain("業務停止");
    expect(result).toContain("免許取消");
  });

  it("financial キーワードを検出する", () => {
    const result = findAllKeywordsInText("百万円以下の罰金または過料に処する");
    expect(result).toContain("罰金");
    expect(result).toContain("過料");
  });

  it("credit キーワードを検出する", () => {
    const result = findAllKeywordsInText("勧告または警告を行うことができる");
    expect(result).toContain("勧告");
    expect(result).toContain("警告");
  });

  it("複数カテゴリのキーワードをすべて検出する", () => {
    const text = "業務停止、罰金、社名公表のいずれかの処分を行う";
    const result = findAllKeywordsInText(text);
    expect(result).toContain("業務停止");
    expect(result).toContain("罰金");
    expect(result).toContain("社名公表");
  });

  it("重複するキーワードは一度だけ返す", () => {
    const text = "罰金を科す。また罰金の上限を引き上げる。";
    const result = findAllKeywordsInText(text);
    const count = result.filter((k) => k === "罰金").length;
    expect(count).toBe(1);
  });

  it("該当キーワードがないとき空配列を返す", () => {
    const result = findAllKeywordsInText("届出様式の変更に関する規定");
    expect(result).toEqual([]);
  });
});

describe("generatePenaltyDetailForFallback", () => {
  it("other のとき null を返す", () => {
    expect(generatePenaltyDetailForFallback("other")).toBeNull();
  });

  it("survival のとき業務停止等に関するテンプレートを返す", () => {
    const result = generatePenaltyDetailForFallback("survival");
    expect(result).not.toBeNull();
    expect(result).toContain("業務停止");
  });

  it("financial のとき罰金等に関するテンプレートを返す", () => {
    const result = generatePenaltyDetailForFallback("financial");
    expect(result).not.toBeNull();
    expect(result).toContain("罰金");
  });

  it("credit のとき社名公表等に関するテンプレートを返す", () => {
    const result = generatePenaltyDetailForFallback("credit");
    expect(result).not.toBeNull();
    expect(result).toContain("社名公表");
  });

  it("各リスク種別でテンプレートが異なる", () => {
    const survival = generatePenaltyDetailForFallback("survival");
    const financial = generatePenaltyDetailForFallback("financial");
    const credit = generatePenaltyDetailForFallback("credit");

    expect(survival).not.toBe(financial);
    expect(financial).not.toBe(credit);
    expect(survival).not.toBe(credit);
  });
});
