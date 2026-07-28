import { supabase } from "@/lib/supabase/client";

export type ReturnReceiptItem = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  line_refund_amount: number;
  restock: boolean;
  serials: {
    id: string;
    serial_number: string | null;
    imei: string | null;
    status: string;
  }[];
};

export type ReturnReceiptData = {
  return_id: string;
  return_number: string;
  status: string;
  reason: string | null;
  notes: string | null;
  refund_amount: number;
  refund_method: string | null;
  completed_at: string | null;
  created_at: string;

  original_sale_id: string;
  original_receipt_number: string;

  organization_name: string;
  branch_name: string;
  processed_by_name: string;

  customer: {
    id: string;
    customer_code: string;
    first_name: string;
    last_name: string | null;
    company_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;

  items: ReturnReceiptItem[];
};

export async function getReturnReceipt(
  returnId: string
): Promise<ReturnReceiptData> {
  const { data: returnRecord, error: returnError } = await supabase
    .from("returns")
    .select(
      `
      id,
      return_number,
      status,
      reason,
      notes,
      refund_amount,
      refund_method,
      completed_at,
      created_at,

      sales:sale_id (
        id,
        receipt_number
      ),

      organizations:organization_id (
        id,
        name
      ),

      branches:branch_id (
        id,
        name
      ),

      profiles:processed_by (
        id,
        full_name
      ),

      customers:customer_id (
        id,
        customer_code,
        first_name,
        last_name,
        company_name,
        phone,
        email
      )
    `
    )
    .eq("id", returnId)
    .single();

  if (returnError) {
    console.error("Failed to load return receipt:", returnError);

    throw new Error(
      returnError.message || "Unable to load the return receipt."
    );
  }

  const { data: returnItems, error: itemsError } = await supabase
    .from("return_items")
    .select(
      `
      id,
      product_id,
      quantity,
      unit_price,
      line_refund_amount,
      restock,
      created_at,

      products:product_id (
        id,
        name,
        sku
      )
    `
    )
    .eq("return_id", returnId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    console.error("Failed to load return receipt items:", itemsError);

    throw new Error(itemsError.message || "Unable to load returned items.");
  }

  const returnItemIds = (returnItems ?? []).map((item) => item.id);

  let returnSerials: {
    return_item_id: string;
    product_serials: {
      id: string;
      serial_number: string | null;
      imei: string | null;
      status: string;
    } | null;
  }[] = [];

  if (returnItemIds.length > 0) {
    const { data: serialData, error: serialError } = await supabase
      .from("return_serials")
      .select(
        `
        return_item_id,

        product_serials:product_serial_id (
          id,
          serial_number,
          imei,
          status
        )
      `
      )
      .in("return_item_id", returnItemIds);

    if (serialError) {
      console.error(
        "Failed to load returned serial or IMEI records:",
        serialError
      );

      throw new Error(
        serialError.message || "Unable to load returned serial or IMEI records."
      );
    }

    returnSerials = (serialData ?? []).map((record) => {
      const productSerial = Array.isArray(record.product_serials)
        ? record.product_serials[0]
        : record.product_serials;

      return {
        return_item_id: record.return_item_id,
        product_serials: productSerial
          ? {
              id: productSerial.id,
              serial_number: productSerial.serial_number,
              imei: productSerial.imei,
              status: productSerial.status,
            }
          : null,
      };
    });
  }

  const sale = Array.isArray(returnRecord.sales)
    ? returnRecord.sales[0]
    : returnRecord.sales;

  const organization = Array.isArray(returnRecord.organizations)
    ? returnRecord.organizations[0]
    : returnRecord.organizations;

  const branch = Array.isArray(returnRecord.branches)
    ? returnRecord.branches[0]
    : returnRecord.branches;

  const processedBy = Array.isArray(returnRecord.profiles)
    ? returnRecord.profiles[0]
    : returnRecord.profiles;

  const customer = Array.isArray(returnRecord.customers)
    ? returnRecord.customers[0]
    : returnRecord.customers;

  const items: ReturnReceiptItem[] = (returnItems ?? []).map((item) => {
    const product = Array.isArray(item.products)
      ? item.products[0]
      : item.products;

    return {
      id: item.id,
      product_id: item.product_id,
      product_name: product?.name ?? "Unknown product",
      sku: product?.sku ?? "-",
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      line_refund_amount: Number(item.line_refund_amount),
      restock: Boolean(item.restock),

      serials: returnSerials
        .filter(
          (record) =>
            record.return_item_id === item.id && record.product_serials
        )
        .map((record) => ({
          id: record.product_serials!.id,
          serial_number: record.product_serials!.serial_number,
          imei: record.product_serials!.imei,
          status: record.product_serials!.status,
        })),
    };
  });

  return {
    return_id: returnRecord.id,
    return_number: returnRecord.return_number,
    status: returnRecord.status,
    reason: returnRecord.reason,
    notes: returnRecord.notes,
    refund_amount: Number(returnRecord.refund_amount),
    refund_method: returnRecord.refund_method,
    completed_at: returnRecord.completed_at,
    created_at: returnRecord.created_at,

    original_sale_id: sale?.id ?? "",
    original_receipt_number: sale?.receipt_number ?? "Unknown receipt",

    organization_name: organization?.name ?? "AlphaPOS Business",

    branch_name: branch?.name ?? "Branch",

    processed_by_name: processedBy?.full_name ?? "Staff Member",

    customer: customer
      ? {
          id: customer.id,
          customer_code: customer.customer_code,
          first_name: customer.first_name,
          last_name: customer.last_name,
          company_name: customer.company_name,
          phone: customer.phone,
          email: customer.email,
        }
      : null,

    items,
  };
}
