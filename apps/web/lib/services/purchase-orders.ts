import { supabase } from "@/lib/supabase/client";

export type WorkspaceScope = {
  organizationId: string;
  branchId: string;
};

export type PurchaseOrderStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "ORDERED"
  | "PARTIALLY_RECEIVED"
  | "RECEIVED"
  | "CANCELLED";

export type CreatePurchaseOrderItem = {
  product_id: string;
  quantity: number;
  cost_price: number;
  tax_rate?: number;
  discount_rate?: number;
};

export type CreatePurchaseOrderInput = {
  supplier_id: string;
  branch_id: string;
  items: CreatePurchaseOrderItem[];
  expected_delivery_date?: string | null;
  notes?: string | null;
  status?: "DRAFT" | "SUBMITTED" | "ORDERED";
};

export type CreatePurchaseOrderResult = {
  purchase_order_id: string;
  po_number: string;
  organization_id: string;
  branch_id: string;
  supplier_id: string;
  status: PurchaseOrderStatus;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
};

export type PurchaseOrderRow = {
  id: string;
  organization_id: string;
  po_number: string;
  status: PurchaseOrderStatus;
  expected_delivery_date: string | null;
  ordered_at: string | null;
  received_at: string | null;
  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  notes: string | null;
  created_at: string;
  supplier_id: string;
  supplier_name: string;
  branch_id: string;
  branch_name: string;
  created_by_name: string;
};

export type PurchaseOrderItemRow = {
  id: string;
  product_id: string;
  product_name: string;
  sku: string;

  quantity: number;
  received_quantity: number;

  cost_price: number;
  tax_rate: number;
  discount_rate: number;
  line_total: number;

  is_serialized: boolean;
  requires_imei: boolean;
};

export type PurchaseOrderDetails = PurchaseOrderRow & {
  items: PurchaseOrderItemRow[];
};

export type OrderPurchaseOrderResult = {
  purchase_order_id: string;
  po_number: string;
  status: "ORDERED";
  ordered_at: string;
};

export type ReceivePurchaseOrderIdentifier = {
  serial_number?: string | null;
  imei?: string | null;
};

export type ReceivePurchaseOrderItem = {
  purchase_order_item_id: string;
  quantity: number;
  identifiers?: ReceivePurchaseOrderIdentifier[];
};

export type ReceivePurchaseOrderResult = {
  purchase_order_id: string;
  po_number: string;
  status: "PARTIALLY_RECEIVED" | "RECEIVED";
  received_lines: number;
  received_units: number;
  total_ordered: number;
  total_received: number;
};

function mapPurchaseOrderRow(purchaseOrder: any): PurchaseOrderRow {
  return {
    id: purchaseOrder.id,
    organization_id: purchaseOrder.organization_id,
    po_number: purchaseOrder.po_number,
    status: purchaseOrder.status as PurchaseOrderStatus,
    expected_delivery_date: purchaseOrder.expected_delivery_date,
    ordered_at: purchaseOrder.ordered_at,
    received_at: purchaseOrder.received_at,
    subtotal: Number(purchaseOrder.subtotal ?? 0),
    tax_amount: Number(purchaseOrder.tax_amount ?? 0),
    discount_amount: Number(purchaseOrder.discount_amount ?? 0),
    total_amount: Number(purchaseOrder.total_amount ?? 0),
    notes: purchaseOrder.notes,
    created_at: purchaseOrder.created_at,
    supplier_id: purchaseOrder.supplier_id,
    supplier_name: purchaseOrder.suppliers?.name ?? "Unknown supplier",
    branch_id: purchaseOrder.branch_id,
    branch_name: purchaseOrder.branches?.name ?? "Unknown branch",
    created_by_name: purchaseOrder.profiles?.full_name ?? "Unknown user",
  };
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput
): Promise<CreatePurchaseOrderResult> {
  if (!input.supplier_id) {
    throw new Error("Please select a supplier.");
  }

  if (!input.branch_id) {
    throw new Error("Please select a branch.");
  }

  if (!input.items.length) {
    throw new Error("Please add at least one product to the purchase order.");
  }

  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_supplier_id: input.supplier_id,
    p_branch_id: input.branch_id,
    p_items: input.items,
    p_expected_delivery_date: input.expected_delivery_date || null,
    p_notes: input.notes?.trim() || null,
    p_status: input.status ?? "DRAFT",
  });

  if (error) {
    throw new Error(error.message || "Unable to create the purchase order.");
  }

  if (!data) {
    throw new Error(
      "The purchase order was created but no result was returned."
    );
  }

  return data as CreatePurchaseOrderResult;
}

export async function orderPurchaseOrder(
  purchaseOrderId: string
): Promise<OrderPurchaseOrderResult> {
  if (!purchaseOrderId) {
    throw new Error("Purchase order ID is required.");
  }

  const { data, error } = await supabase.rpc("order_purchase_order", {
    p_purchase_order_id: purchaseOrderId,
  });

  if (error) {
    throw new Error(error.message || "Unable to place the purchase order.");
  }

  if (!data) {
    throw new Error(
      "The purchase order was updated but no result was returned."
    );
  }

  return data as OrderPurchaseOrderResult;
}

export async function receivePurchaseOrderGoods(
  purchaseOrderId: string,
  items: ReceivePurchaseOrderItem[],
  notes?: string | null
): Promise<ReceivePurchaseOrderResult> {
  if (!purchaseOrderId) {
    throw new Error("Purchase order ID is required.");
  }

  if (!items.length) {
    throw new Error("Please select at least one product to receive.");
  }

  const { data, error } = await supabase.rpc("receive_purchase_order_goods", {
    p_purchase_order_id: purchaseOrderId,
    p_items: items,
    p_notes: notes?.trim() || null,
  });

  if (error) {
    throw new Error(
      error.message || "Unable to receive the purchase order goods."
    );
  }

  if (!data) {
    throw new Error("The goods were received but no result was returned.");
  }

  return data as ReceivePurchaseOrderResult;
}

export async function getPurchaseOrders(
  scope: WorkspaceScope
): Promise<PurchaseOrderRow[]> {
  if (!scope.organizationId || !scope.branchId) {
    throw new Error(
      "Organisation and branch are required to load purchase orders."
    );
  }

  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      `
      id,
      organization_id,
      po_number,
      status,
      expected_delivery_date,
      ordered_at,
      received_at,
      subtotal,
      tax_amount,
      discount_amount,
      total_amount,
      notes,
      created_at,
      supplier_id,
      branch_id,
      suppliers ( name ),
      branches ( name ),
      profiles!purchase_orders_created_by_fkey ( full_name )
    `
    )
    .eq("organization_id", scope.organizationId)
    .eq("branch_id", scope.branchId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message || "Unable to load purchase orders.");
  }

  return (data ?? []).map(mapPurchaseOrderRow);
}

export async function getPurchaseOrderDetails(
  purchaseOrderId: string,
  scope: WorkspaceScope
): Promise<PurchaseOrderDetails> {
  if (!purchaseOrderId) {
    throw new Error("Purchase order ID is required.");
  }

  if (!scope.organizationId || !scope.branchId) {
    throw new Error(
      "Organisation and branch are required to load the purchase order."
    );
  }

  const { data: purchaseOrder, error: purchaseOrderError } = await supabase
    .from("purchase_orders")
    .select(
      `
        id,
        organization_id,
        po_number,
        status,
        expected_delivery_date,
        ordered_at,
        received_at,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        notes,
        created_at,
        supplier_id,
        branch_id,
        suppliers ( name ),
        branches ( name ),
        profiles!purchase_orders_created_by_fkey ( full_name )
      `
    )
    .eq("id", purchaseOrderId)
    .eq("organization_id", scope.organizationId)
    .eq("branch_id", scope.branchId)
    .single();

  if (purchaseOrderError) {
    throw new Error(
      purchaseOrderError.message ||
        "Unable to load the purchase order in the selected workspace."
    );
  }

  /*
   * Items are loaded only after the parent purchase order has
   * successfully passed the organisation + branch workspace check.
   *
   * purchase_order_items are therefore constrained by the verified
   * parent purchase order ID rather than accepting an arbitrary PO ID.
   */
  const { data: items, error: itemsError } = await supabase
    .from("purchase_order_items")
    .select(
      `
        id,
        product_id,
        quantity,
        received_quantity,
        cost_price,
        tax_rate,
        discount_rate,
        line_total,
        products (
          name,
          sku,
          is_serialized,
          requires_imei
        )
      `
    )
    .eq("purchase_order_id", purchaseOrder.id)
    .order("id");

  if (itemsError) {
    throw new Error(
      itemsError.message || "Unable to load purchase order items."
    );
  }

  return {
    ...mapPurchaseOrderRow(purchaseOrder),

    items: (items ?? []).map((item: any) => ({
      id: item.id,
      product_id: item.product_id,
      product_name: item.products?.name ?? "Unknown product",
      sku: item.products?.sku ?? "—",

      quantity: Number(item.quantity ?? 0),
      received_quantity: Number(item.received_quantity ?? 0),

      cost_price: Number(item.cost_price ?? 0),
      tax_rate: Number(item.tax_rate ?? 0),
      discount_rate: Number(item.discount_rate ?? 0),
      line_total: Number(item.line_total ?? 0),

      is_serialized: Boolean(item.products?.is_serialized),
      requires_imei: Boolean(item.products?.requires_imei),
    })),
  };
}
