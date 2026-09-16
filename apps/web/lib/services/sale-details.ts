import { supabase } from "@/lib/supabase/client";

export type SaleDetailItem = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;

  quantity: number;
  already_returned: number;
  remaining_returnable: number;

  unit_price: number;
  unit_cost: number;
  discount_amount: number;
  vat_amount: number;
  line_total: number;

  serials: {
    id: string;
    serial_number: string | null;
    imei: string | null;
    status: string;
  }[];
};

export type SaleDetailPayment = {
  id: string;
  payment_method: string;
  amount: number;
  reference: string | null;
  created_at: string;
};

export type SaleDetails = {
  id: string;
  receipt_number: string;
  status: string;
  subtotal: number;
  vat_amount: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
  completed_at: string | null;

  organization: {
    id: string;
    name: string;
  } | null;

  branch: {
    id: string;
    name: string;
  } | null;

  cashier: {
    id: string;
    full_name: string | null;
  } | null;

  customer: {
    id: string;
    customer_code: string;
    first_name: string;
    last_name: string | null;
    company_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;

  items: SaleDetailItem[];
  payments: SaleDetailPayment[];
};

export type SaleDetailsWorkspaceScope = {
  organizationId: string;
  branchId: string;
};

export async function getSaleDetails(
  saleId: string,
  scope: SaleDetailsWorkspaceScope
): Promise<SaleDetails> {
  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .select(
      `
      id,
      receipt_number,
      status,
      subtotal,
      vat_amount,
      discount_amount,
      total_amount,
      notes,
      created_at,
      completed_at,

      organizations:organization_id (
        id,
        name
      ),

      branches:branch_id (
        id,
        name
      ),

      profiles:cashier_id (
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
    .eq("id", saleId)
    .eq("organization_id", scope.organizationId)
    .eq("branch_id", scope.branchId)
    .single();

  if (saleError) {
    console.error("Failed to load sale details:", saleError);

    throw new Error(saleError.message || "Unable to load sale details.");
  }

  const { data: saleItems, error: itemsError } = await supabase
    .from("sale_items")
    .select(
      `
        id,
        product_id,
        quantity,
        unit_price,
        unit_cost,
        discount_amount,
        vat_amount,
        line_total,
        created_at,

        products:product_id (
          id,
          name,
          sku
        )
      `
    )
    .eq("sale_id", saleId)
    .eq("organization_id", scope.organizationId)
    .eq("branch_id", scope.branchId)
    .order("created_at", {
      ascending: true,
    });

  if (itemsError) {
    console.error("Failed to load sale items:", itemsError);

    throw new Error(itemsError.message || "Unable to load sale items.");
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select(
      `
        id,
        payment_method,
        amount,
        reference,
        created_at
      `
    )
    .eq("sale_id", saleId)
    .eq("organization_id", scope.organizationId)
    .eq("branch_id", scope.branchId)
    .order("created_at", {
      ascending: true,
    });

  if (paymentsError) {
    console.error("Failed to load sale payments:", paymentsError);

    throw new Error(paymentsError.message || "Unable to load sale payments.");
  }

  const { data: serialRecords, error: serialsError } = await supabase
    .from("product_serials")
    .select(
      `
        id,
        product_id,
        serial_number,
        imei,
        status
      `
    )
    .eq("sale_id", saleId)
    .eq("organization_id", scope.organizationId)
    .eq("branch_id", scope.branchId);

  if (serialsError) {
    console.error("Failed to load sold serials:", serialsError);

    throw new Error(
      serialsError.message || "Unable to load sale serial and IMEI records."
    );
  }

  /*
   * Return history is loaded separately so the application
   * can calculate exactly how many units from each sale item
   * remain eligible for return.
   *
   * Only COMPLETED returns count against the available
   * quantity.
   */
  const { data: completedReturnItems, error: returnItemsError } = await supabase
    .from("return_items")
    .select(
      `
      sale_item_id,
      quantity,

      returns:return_id!inner (
        status
      )
    `
    )
    .eq("sale_id", saleId)
    .eq("organization_id", scope.organizationId)
    .eq("branch_id", scope.branchId)
    .eq("returns.status", "COMPLETED");

  if (returnItemsError) {
    console.error(
      "Failed to load completed return quantities:",
      returnItemsError
    );

    throw new Error(
      returnItemsError.message ||
        "Unable to determine previously returned quantities."
    );
  }

  const returnedQuantityBySaleItem = new Map<string, number>();

  for (const returnItem of completedReturnItems ?? []) {
    const current =
      returnedQuantityBySaleItem.get(returnItem.sale_item_id) ?? 0;

    returnedQuantityBySaleItem.set(
      returnItem.sale_item_id,
      current + Number(returnItem.quantity)
    );
  }

  const organization = Array.isArray(sale.organizations)
    ? sale.organizations[0]
    : sale.organizations;

  const branch = Array.isArray(sale.branches)
    ? sale.branches[0]
    : sale.branches;

  const cashier = Array.isArray(sale.profiles)
    ? sale.profiles[0]
    : sale.profiles;

  const customer = Array.isArray(sale.customers)
    ? sale.customers[0]
    : sale.customers;

  const items: SaleDetailItem[] = (saleItems ?? []).map((item) => {
    const product = Array.isArray(item.products)
      ? item.products[0]
      : item.products;

    const quantity = Number(item.quantity);

    const alreadyReturned = returnedQuantityBySaleItem.get(item.id) ?? 0;

    const remainingReturnable = Math.max(quantity - alreadyReturned, 0);

    /*
     * Only SOLD identifiers are eligible for another
     * return. Returned/restocked identifiers must never
     * be offered again.
     */
    const eligibleSerials = (serialRecords ?? [])
      .filter(
        (serial) =>
          serial.product_id === item.product_id && serial.status === "SOLD"
      )
      .map((serial) => ({
        id: serial.id,
        serial_number: serial.serial_number,
        imei: serial.imei,
        status: serial.status,
      }));

    return {
      id: item.id,
      product_id: item.product_id,
      product_name: product?.name ?? "Unknown product",
      sku: product?.sku ?? "-",

      quantity,
      already_returned: alreadyReturned,
      remaining_returnable: remainingReturnable,

      unit_price: Number(item.unit_price),
      unit_cost: Number(item.unit_cost),
      discount_amount: Number(item.discount_amount),
      vat_amount: Number(item.vat_amount),
      line_total: Number(item.line_total),

      serials: eligibleSerials,
    };
  });

  return {
    id: sale.id,
    receipt_number: sale.receipt_number,
    status: sale.status,
    subtotal: Number(sale.subtotal),
    vat_amount: Number(sale.vat_amount),
    discount_amount: Number(sale.discount_amount),
    total_amount: Number(sale.total_amount),
    notes: sale.notes,
    created_at: sale.created_at,
    completed_at: sale.completed_at,

    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
        }
      : null,

    branch: branch
      ? {
          id: branch.id,
          name: branch.name,
        }
      : null,

    cashier: cashier
      ? {
          id: cashier.id,
          full_name: cashier.full_name,
        }
      : null,

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

    payments: (payments ?? []).map((payment) => ({
      id: payment.id,
      payment_method: payment.payment_method,
      amount: Number(payment.amount),
      reference: payment.reference,
      created_at: payment.created_at,
    })),
  };
}
