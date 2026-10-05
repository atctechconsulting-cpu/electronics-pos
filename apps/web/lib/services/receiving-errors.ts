// Only known receiving failures become user-facing messages. Never expose
// arbitrary Postgres messages, details, hints or constraint names.
export function receivingError(error: unknown): Error {
  const failure = error as { code?: string; message?: string } | null;
  const message = typeof failure?.message === "string" ? failure.message : "";
  if (failure?.code === "23514" && message === "IMEI must contain exactly 15 digits.") {
    return new Error(message);
  }
  if (failure?.code === "P0001") {
    if (/^(IMEI|Serial number) .+ already exists\.$/.test(message)) {
      return new Error("An IMEI or serial number already exists in this organisation. Check the identifiers.");
    }
    if (/^A serial number is required for .+\.$/.test(message)) return new Error("A serial number is required for each serialized-only unit.");
    if (/^An IMEI is required for .+\.$/.test(message)) return new Error("An IMEI is required for each IMEI-tracked unit.");
    const allowed = new Set([
      "A stock reference is required.",
      "Received quantity must be greater than zero.",
      "Unit cost cannot be negative.",
      "The selected branch is invalid or inactive.",
      "The selected product does not belong to this organisation or is inactive.",
      "You must be signed in to receive stock.",
      "You must be signed in to receive goods.",
      "You do not have permission to manage inventory for this branch.",
      "You do not have permission to receive purchasing goods for this branch.",
      "Only ordered purchase orders can receive goods.",
      "Received quantity exceeds the remaining quantity for this product.",
      "The number of serial or IMEI identifiers must match the received quantity.",
      "The number of serial or IMEI entries must match the received quantity.",
      "Serial or IMEI details are required for tracked products.",
      "This branch is inactive. An authorised administrator must reactivate it before new operations.",
    ]);
    if (allowed.has(message)) return new Error(message);
  }
  return new Error("Unable to receive stock. Check the receipt details and try again.");
}
