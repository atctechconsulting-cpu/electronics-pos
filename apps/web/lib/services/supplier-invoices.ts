import { supabase } from "@/lib/supabase/client";

export type SupplierInvoiceStatus =
  "UNPAID" | "PARTIALLY_PAID" | "PAID" | "CANCELLED";

export type SupplierPaymentMethod =
  "CASH" | "BANK_TRANSFER" | "CARD" | "CHEQUE" | "OTHER";

export type CreateSupplierInvoiceInput = {
  supplierId: string;
  branchId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string | null;
  purchaseOrderId?: string | null;
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  notes?: string | null;
};

export type CreateSupplierInvoiceResult = {
  supplier_invoice_id: string;
  invoice_number: string;
  supplier_id: string;
  branch_id: string;
  purchase_order_id: string | null;
  status: SupplierInvoiceStatus;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
};

export type RecordSupplierPaymentInput = {
  supplierInvoiceId: string;
  amount: number;
  paymentMethod: SupplierPaymentMethod;
  paymentDate: string;
  reference?: string | null;
  notes?: string | null;
};

export type RecordSupplierPaymentResult = {
  supplier_payment_id: string;
  supplier_invoice_id: string;
  invoice_number: string;
  payment_amount: number;
  payment_method: SupplierPaymentMethod;
  status: SupplierInvoiceStatus;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
};

export type SupplierInvoiceRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  supplier_id: string;
  purchase_order_id: string | null;

  invoice_number: string;
  invoice_date: string;
  due_date: string | null;

  status: SupplierInvoiceStatus;

  subtotal: number;
  tax_amount: number;
  discount_amount: number;
  total_amount: number;
  amount_paid: number;
  amount_due: number;

  notes: string | null;

  created_at: string;
  updated_at: string;

  supplier_name: string;
  branch_name: string;
  po_number: string | null;
};

export type SupplierPaymentRow = {
  id: string;
  amount: number;
  payment_method: SupplierPaymentMethod;
  reference: string | null;
  payment_date: string;
  notes: string | null;
  created_at: string;
  created_by_name: string;
};

export type SupplierInvoiceDetails = SupplierInvoiceRow & {
  created_by_name: string;
  payments: SupplierPaymentRow[];
};

type JoinedName = {
  name?: string | null;
};

type JoinedPurchaseOrder = {
  po_number?: string | null;
};

type JoinedProfile = {
  full_name?: string | null;
};

function getJoinedRecord<T>(value: unknown): T | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    return (value[0] as T | undefined) ?? null;
  }

  return value as T;
}

function getProfileName(value: unknown) {
  const profile = getJoinedRecord<JoinedProfile>(value);

  return profile?.full_name?.trim() || "Unknown";
}

export async function createSupplierInvoice(
  input: CreateSupplierInvoiceInput
): Promise<CreateSupplierInvoiceResult> {
  const { data, error } = await supabase.rpc("create_supplier_invoice", {
    p_supplier_id: input.supplierId,
    p_branch_id: input.branchId,
    p_invoice_number: input.invoiceNumber.trim(),
    p_invoice_date: input.invoiceDate,
    p_due_date: input.dueDate || null,
    p_purchase_order_id: input.purchaseOrderId || null,
    p_subtotal: input.subtotal,
    p_tax_amount: input.taxAmount,
    p_discount_amount: input.discountAmount,
    p_total_amount: input.totalAmount,
    p_notes: input.notes?.trim() || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error("Supplier invoice was created but no result was returned.");
  }

  return data as CreateSupplierInvoiceResult;
}

export async function recordSupplierPayment(
  input: RecordSupplierPaymentInput
): Promise<RecordSupplierPaymentResult> {
  const { data, error } = await supabase.rpc("record_supplier_payment", {
    p_supplier_invoice_id: input.supplierInvoiceId,
    p_amount: input.amount,
    p_payment_method: input.paymentMethod,
    p_payment_date: input.paymentDate,
    p_reference: input.reference?.trim() || null,
    p_notes: input.notes?.trim() || null,
  });

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    throw new Error(
      "Supplier payment was recorded but no result was returned."
    );
  }

  return data as RecordSupplierPaymentResult;
}

export async function getSupplierInvoices(): Promise<SupplierInvoiceRow[]> {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select(
      `
        id,
        organization_id,
        branch_id,
        supplier_id,
        purchase_order_id,
        invoice_number,
        invoice_date,
        due_date,
        status,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        amount_paid,
        amount_due,
        notes,
        created_at,
        updated_at,
        suppliers (
          name
        ),
        branches (
          name
        ),
        purchase_orders (
          po_number
        )
      `
    )
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => {
    const supplier = getJoinedRecord<JoinedName>(row.suppliers);
    const branch = getJoinedRecord<JoinedName>(row.branches);
    const purchaseOrder = getJoinedRecord<JoinedPurchaseOrder>(
      row.purchase_orders
    );

    return {
      id: row.id,
      organization_id: row.organization_id,
      branch_id: row.branch_id,
      supplier_id: row.supplier_id,
      purchase_order_id: row.purchase_order_id,

      invoice_number: row.invoice_number,
      invoice_date: row.invoice_date,
      due_date: row.due_date,

      status: row.status as SupplierInvoiceStatus,

      subtotal: Number(row.subtotal),
      tax_amount: Number(row.tax_amount),
      discount_amount: Number(row.discount_amount),
      total_amount: Number(row.total_amount),
      amount_paid: Number(row.amount_paid),
      amount_due: Number(row.amount_due),

      notes: row.notes,

      created_at: row.created_at,
      updated_at: row.updated_at,

      supplier_name: supplier?.name || "Unknown supplier",
      branch_name: branch?.name || "Unknown branch",
      po_number: purchaseOrder?.po_number || null,
    };
  });
}

export async function getSupplierInvoiceDetails(
  supplierInvoiceId: string
): Promise<SupplierInvoiceDetails> {
  const { data: invoice, error: invoiceError } = await supabase
    .from("supplier_invoices")
    .select(
      `
        id,
        organization_id,
        branch_id,
        supplier_id,
        purchase_order_id,
        invoice_number,
        invoice_date,
        due_date,
        status,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        amount_paid,
        amount_due,
        notes,
        created_at,
        updated_at,
        suppliers (
          name
        ),
        branches (
          name
        ),
        purchase_orders (
          po_number
        ),
        profiles!supplier_invoices_created_by_fkey (
          full_name          
        )
      `
    )
    .eq("id", supplierInvoiceId)
    .single();

  if (invoiceError) {
    throw new Error(invoiceError.message);
  }

  const { data: payments, error: paymentsError } = await supabase
    .from("supplier_payments")
    .select(
      `
        id,
        amount,
        payment_method,
        reference,
        payment_date,
        notes,
        created_at,
        profiles!supplier_payments_created_by_fkey (
          full_name
        )
      `
    )
    .eq("supplier_invoice_id", supplierInvoiceId)
    .order("payment_date", {
      ascending: false,
    })
    .order("created_at", {
      ascending: false,
    });

  if (paymentsError) {
    throw new Error(paymentsError.message);
  }

  const supplier = getJoinedRecord<JoinedName>(invoice.suppliers);
  const branch = getJoinedRecord<JoinedName>(invoice.branches);
  const purchaseOrder = getJoinedRecord<JoinedPurchaseOrder>(
    invoice.purchase_orders
  );

  return {
    id: invoice.id,
    organization_id: invoice.organization_id,
    branch_id: invoice.branch_id,
    supplier_id: invoice.supplier_id,
    purchase_order_id: invoice.purchase_order_id,

    invoice_number: invoice.invoice_number,
    invoice_date: invoice.invoice_date,
    due_date: invoice.due_date,

    status: invoice.status as SupplierInvoiceStatus,

    subtotal: Number(invoice.subtotal),
    tax_amount: Number(invoice.tax_amount),
    discount_amount: Number(invoice.discount_amount),
    total_amount: Number(invoice.total_amount),
    amount_paid: Number(invoice.amount_paid),
    amount_due: Number(invoice.amount_due),

    notes: invoice.notes,

    created_at: invoice.created_at,
    updated_at: invoice.updated_at,

    supplier_name: supplier?.name || "Unknown supplier",
    branch_name: branch?.name || "Unknown branch",
    po_number: purchaseOrder?.po_number || null,

    created_by_name: getProfileName(invoice.profiles),

    payments: (payments ?? []).map((payment) => ({
      id: payment.id,
      amount: Number(payment.amount),
      payment_method: payment.payment_method as SupplierPaymentMethod,
      reference: payment.reference,
      payment_date: payment.payment_date,
      notes: payment.notes,
      created_at: payment.created_at,
      created_by_name: getProfileName(payment.profiles),
    })),
  };
}

export async function getSupplierInvoiceForPurchaseOrder(
  purchaseOrderId: string
): Promise<SupplierInvoiceRow | null> {
  const { data, error } = await supabase
    .from("supplier_invoices")
    .select(
      `
        id,
        organization_id,
        branch_id,
        supplier_id,
        purchase_order_id,
        invoice_number,
        invoice_date,
        due_date,
        status,
        subtotal,
        tax_amount,
        discount_amount,
        total_amount,
        amount_paid,
        amount_due,
        notes,
        created_at,
        updated_at,
        suppliers (
          name
        ),
        branches (
          name
        ),
        purchase_orders (
          po_number
        )
      `
    )
    .eq("purchase_order_id", purchaseOrderId)
    .neq("status", "CANCELLED")
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data) {
    return null;
  }

  const supplier = getJoinedRecord<JoinedName>(data.suppliers);
  const branch = getJoinedRecord<JoinedName>(data.branches);
  const purchaseOrder = getJoinedRecord<JoinedPurchaseOrder>(
    data.purchase_orders
  );

  return {
    id: data.id,
    organization_id: data.organization_id,
    branch_id: data.branch_id,
    supplier_id: data.supplier_id,
    purchase_order_id: data.purchase_order_id,

    invoice_number: data.invoice_number,
    invoice_date: data.invoice_date,
    due_date: data.due_date,

    status: data.status as SupplierInvoiceStatus,

    subtotal: Number(data.subtotal),
    tax_amount: Number(data.tax_amount),
    discount_amount: Number(data.discount_amount),
    total_amount: Number(data.total_amount),
    amount_paid: Number(data.amount_paid),
    amount_due: Number(data.amount_due),

    notes: data.notes,

    created_at: data.created_at,
    updated_at: data.updated_at,

    supplier_name: supplier?.name || "Unknown supplier",
    branch_name: branch?.name || "Unknown branch",
    po_number: purchaseOrder?.po_number || null,
  };
}
