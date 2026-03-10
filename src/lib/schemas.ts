import { z } from "zod";

export const NormTypeEnum = z.enum([
  "LAW", "ORDINANCE", "REGULATION", "GUIDELINE", "NOTICE", "OTHER",
]);

export const NotificationFilterCreateSchema = z.object({
  name: z.string().min(1, "名前は必須です").max(100, "名前は100文字以内にしてください"),
  publishedFrom: z.string().datetime({ offset: true }).optional().nullable(),
  publishedTo: z.string().datetime({ offset: true }).optional().nullable(),
  riskSurvival: z.boolean().default(false),
  riskFinancial: z.boolean().default(false),
  riskCredit: z.boolean().default(false),
  riskOther: z.boolean().default(false),
  normType: NormTypeEnum.optional().nullable(),
  tagId: z.string().cuid("タグIDの形式が不正です").optional().nullable(),
});

export const NotificationFilterUpdateSchema = NotificationFilterCreateSchema.partial();

export const AnalyzeQuerySchema = z.object({
  normSourceId: z.string().cuid("normSourceIdの形式が不正です").optional(),
  replace: z.enum(["0", "1"]).optional(),
});

export const NormChangesQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: NormTypeEnum.optional(),
  riskSurvival: z.enum(["true", "false"]).optional(),
  riskFinancial: z.enum(["true", "false"]).optional(),
  riskCredit: z.enum(["true", "false"]).optional(),
  riskOther: z.enum(["true", "false"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で指定してください").optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で指定してください").optional(),
});
