import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).transform(value => value || null).nullable();
export const branchUpdateSchema = z.object({
  name: z.string().trim().min(1, "Enter a branch name.").max(200),
  email: optionalText(320).refine(value => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), "Enter a valid branch email address."),
  phone: optionalText(50),
  address_line_1: optionalText(300), address_line_2: optionalText(300),
  city: optionalText(120), county: optionalText(120), postcode: optionalText(40),
  country: z.string().trim().min(1, "Enter a country.").max(120),
}).strict();
export const branchCreateSchema = branchUpdateSchema.extend({
  code: z.string().trim().min(1, "Enter a branch code.").max(64).transform(value => value.toUpperCase()),
}).strict();
export type BranchDetails = z.infer<typeof branchUpdateSchema>;
export type NewBranch = z.infer<typeof branchCreateSchema>;

export function parseBranchInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const label = String(issue.path[0] ?? "Branch details").replaceAll("_", " ");
  throw new Error(`${label}: ${issue.message}`);
}
