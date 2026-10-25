// Margin is not commercially meaningful when its revenue base is non-positive.
// Keep the database percentage and all monetary values unchanged.
export function formatGrossMargin(
  margin: number | null | undefined,
  revenue: number
): string {
  if (revenue <= 0 || margin == null) return "N/A";
  return `${Number(margin).toFixed(1)}%`;
}
