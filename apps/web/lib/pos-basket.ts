import { isValidImei } from "@/lib/validations/imei";

export type PosIdentifier = { id: string; serial_number: string | null; imei: string | null };
export type PosProduct = {
  id: string;
  name: string;
  sku: string;
  retail_price: number;
  quantity_available: number;
  is_serialized: boolean;
  requires_imei: boolean;
};
export type PosBasketItem = PosProduct & { quantity: number; identifiers: PosIdentifier[] };
export const isTracked = (product: Pick<PosProduct, "is_serialized" | "requires_imei">) =>
  product.is_serialized || product.requires_imei;
export const identifierLabel = (product: Pick<PosProduct, "requires_imei">, row: PosIdentifier) =>
  product.requires_imei ? row.imei ?? "" : row.serial_number ?? "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// UX validation only. The RPC independently validates current database rows.
export function checkoutItems(basket: PosBasketItem[]) {
  if (!basket.length) throw new Error("The basket is empty.");
  const seen = new Set<string>();
  const products = new Set<string>();
  return basket.map(item => {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) throw new Error("Sale quantities must be greater than zero.");
    if (products.has(item.id)) throw new Error("A product may appear only once in the basket.");
    products.add(item.id);
    const identifiers = item.identifiers ?? [];
    if (isTracked(item) && identifiers.length !== item.quantity) {
      throw new Error("Select exactly one identifier for each tracked unit.");
    }
    if (!isTracked(item) && identifiers.length) throw new Error("Ordinary products cannot have selected identifiers.");
    for (const row of identifiers) {
      if (!uuid.test(row.id)) throw new Error("A selected identifier is invalid. Select the device again.");
      const id = row.id.toLowerCase();
      if (seen.has(id)) throw new Error("Each identifier may be selected only once per sale.");
      seen.add(id);
      if (item.requires_imei && !isValidImei(row.imei ?? "")) throw new Error("Selected IMEIs must contain exactly 15 digits.");
      if (!item.requires_imei && !row.serial_number?.trim()) throw new Error("A selected device has no serial number.");
    }
    return {
      product_id: item.id, quantity: item.quantity,
      ...(isTracked(item) ? { product_serial_ids: identifiers.map(row => row.id) } : {}),
    };
  });
}

export function addBasketProduct(current: PosBasketItem[], product: PosProduct, selected: PosIdentifier[] = []) {
  const existing = current.find(item => item.id === product.id);
  const tracked = isTracked(product);
  if (tracked && !selected.length) throw new Error("Select a device before adding this product.");
  const quantity = (existing?.quantity ?? 0) + (tracked ? selected.length : 1);
  if (quantity > product.quantity_available) throw new Error("The selected quantity exceeds available stock.");
  const item: PosBasketItem = {
    ...product, retail_price: Number(product.retail_price), quantity_available: Number(product.quantity_available),
    quantity, identifiers: [...(existing?.identifiers ?? []), ...selected],
  };
  const next = existing ? current.map(row => row.id === product.id ? item : row) : [...current, item];
  checkoutItems(next);
  return next;
}

export function decreaseBasketProduct(current: PosBasketItem[], id: string, identifierId?: string) {
  return current.map(item => {
    if (item.id !== id) return item;
    if (isTracked(item)) {
      // Minus removes the last displayed device; explicit remove targets its ID.
      const identifiers = identifierId
        ? item.identifiers.filter(row => row.id !== identifierId)
        : item.identifiers.slice(0, -1);
      return { ...item, identifiers, quantity: identifiers.length };
    }
    return { ...item, quantity: item.quantity - 1 };
  }).filter(item => item.quantity > 0);
}
