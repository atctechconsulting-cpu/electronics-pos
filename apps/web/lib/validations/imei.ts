export const IMEI_ERROR = "IMEI must contain exactly 15 digits.";
export const IMEI_PATTERN = /^[0-9]{15}$/;

export function isValidImei(value: string): boolean {
  return IMEI_PATTERN.test(value);
}

export function assertValidImei(value: string | null | undefined): void {
  if (value != null && !isValidImei(value)) throw new Error(IMEI_ERROR);
}
