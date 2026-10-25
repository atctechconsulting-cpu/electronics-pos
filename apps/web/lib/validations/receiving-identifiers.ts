import { IMEI_ERROR, isValidImei } from "@/lib/validations/imei";

export function splitReceivingIdentifiers(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

export type ReceivingIdentifierError = {
  line: number;
  kind: "blank" | "invalid" | "duplicate";
  message: string;
  originalLine?: number;
};

// Never mutate the draft: whitespace trimming and trailing blank removal are
// derived only. Interior blanks keep their positions and must be corrected.
export function validateReceivingIdentifiers(raw: readonly string[], quantity: number, requiresImei: boolean) {
  const values = Array.from(raw, value => (value ?? "").trim());
  while (values.length && !values[values.length - 1]) values.pop();
  const errors: ReceivingIdentifierError[] = [];
  const firstLines = new Map<string, number>();
  let entered = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  values.forEach((value, index) => {
    const line = index + 1;
    if (!value) {
      invalidCount++;
      errors.push({ line, kind: "blank", message: `Line ${line}: blank entry.` });
      return;
    }
    entered++;
    if (requiresImei && !isValidImei(value)) {
      invalidCount++;
      errors.push({ line, kind: "invalid", message: `Line ${line}: ${IMEI_ERROR}` });
    }
    const originalLine = firstLines.get(value);
    if (originalLine !== undefined) {
      duplicateCount++;
      errors.push({ line, kind: "duplicate", originalLine, message: `Line ${line} duplicates line ${originalLine}.` });
    } else firstLines.set(value, line);
  });
  const quantityValid = Number.isInteger(quantity) && quantity > 0;
  return {
    values, entered, invalidCount, duplicateCount, errors,
    valid: quantityValid && entered === quantity && errors.length === 0,
  };
}
