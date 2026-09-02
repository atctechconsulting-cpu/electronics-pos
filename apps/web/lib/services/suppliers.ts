import { supabase } from "@/lib/supabase/client";

export type Supplier = {
  id: string;
  organization_id: string;
  name: string;
  supplier_code: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  city: string | null;
  postcode: string | null;
  notes: string | null;
  created_at?: string;
  updated_at?: string;
};

export type SupplierBalance = Supplier & {
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
  overdue: number;
  open_invoices: number;
  overdue_invoices: number;
  last_payment_date: string | null;
};

export type SupplierStatementInvoice = {
  id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  total_amount: number;
  amount_paid: number;
  amount_due: number;
  purchase_order_id: string | null;
  po_number: string | null;
  branch_name: string;
};

export type SupplierStatementPayment = {
  id: string;
  supplier_invoice_id: string;
  invoice_number: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  payment_date: string;
  notes: string | null;
  created_at: string;
};

export type SupplierStatement = {
  supplier: Supplier;
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
  overdue: number;
  open_invoices: number;
  overdue_invoices: number;
  invoices: SupplierStatementInvoice[];
  payments: SupplierStatementPayment[];
};

type JoinedRecord = Record<string, unknown>;

function getJoinedRecord(value: unknown): JoinedRecord | null {
  if (!value) return null;

  if (Array.isArray(value)) {
    const first = value[0];

    if (first && typeof first === "object") {
      return first as JoinedRecord;
    }

    return null;
  }

  if (typeof value === "object") {
    return value as JoinedRecord;
  }

  return null;
}

function getJoinedString(value: unknown, field: string, fallback = "") {
  const record = getJoinedRecord(value);
  const result = record?.[field];

  return typeof result === "string" && result.trim() ? result.trim() : fallback;
}

function isOverdue(dueDate: string | null, amountDue: number, status: string) {
  if (!dueDate || amountDue <= 0) return false;

  if (status === "PAID" || status === "CANCELLED") {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(`${dueDate}T00:00:00`);

  return due < today;
}

export async function getSuppliers(
  organizationId: string
): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw error;

  return (data ?? []) as Supplier[];
}

export async function createSupplier(values: {
  organization_id: string;
  name: string;
  supplier_code: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  postcode?: string | null;
  notes?: string | null;
}) {
  const { data, error } = await supabase
    .from("suppliers")
    .insert(values)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function getSupplierBalances(
  organizationId: string
): Promise<SupplierBalance[]> {
  const [suppliersResult, invoicesResult, paymentsResult] = await Promise.all([
    supabase
      .from("suppliers")
      .select("*")
      .eq("organization_id", organizationId)
      .order("name"),

    supabase
      .from("supplier_invoices")
      .select(
        `
            id,
            supplier_id,
            status,
            due_date,
            total_amount,
            amount_paid,
            amount_due
          `
      )
      .eq("organization_id", organizationId)
      .neq("status", "CANCELLED"),

    supabase
      .from("supplier_payments")
      .select(
        `
            supplier_id,
            payment_date
          `
      )
      .eq("organization_id", organizationId)
      .order("payment_date", { ascending: false }),
  ]);

  if (suppliersResult.error) {
    throw suppliersResult.error;
  }

  if (invoicesResult.error) {
    throw invoicesResult.error;
  }

  if (paymentsResult.error) {
    throw paymentsResult.error;
  }

  const suppliers = (suppliersResult.data ?? []) as Supplier[];
  const invoices = invoicesResult.data ?? [];
  const payments = paymentsResult.data ?? [];

  return suppliers.map((supplier) => {
    const supplierInvoices = invoices.filter(
      (invoice) => invoice.supplier_id === supplier.id
    );

    const supplierPayments = payments.filter(
      (payment) => payment.supplier_id === supplier.id
    );

    const totalInvoiced = supplierInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.total_amount ?? 0),
      0
    );

    const totalPaid = supplierInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.amount_paid ?? 0),
      0
    );

    const outstanding = supplierInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.amount_due ?? 0),
      0
    );

    const overdueInvoices = supplierInvoices.filter((invoice) =>
      isOverdue(
        invoice.due_date,
        Number(invoice.amount_due ?? 0),
        invoice.status
      )
    );

    const overdue = overdueInvoices.reduce(
      (sum, invoice) => sum + Number(invoice.amount_due ?? 0),
      0
    );

    const openInvoices = supplierInvoices.filter(
      (invoice) =>
        invoice.status === "UNPAID" || invoice.status === "PARTIALLY_PAID"
    ).length;

    return {
      ...supplier,
      total_invoiced: totalInvoiced,
      total_paid: totalPaid,
      outstanding,
      overdue,
      open_invoices: openInvoices,
      overdue_invoices: overdueInvoices.length,
      last_payment_date: supplierPayments[0]?.payment_date ?? null,
    };
  });
}

export async function getSupplierStatement(
  supplierId: string
): Promise<SupplierStatement> {
  const supplierResult = await supabase
    .from("suppliers")
    .select("*")
    .eq("id", supplierId)
    .single();

  if (supplierResult.error) {
    throw supplierResult.error;
  }

  const supplier = supplierResult.data as Supplier;

  const [invoicesResult, paymentsResult] = await Promise.all([
    supabase
      .from("supplier_invoices")
      .select(
        `
            id,
            invoice_number,
            invoice_date,
            due_date,
            status,
            total_amount,
            amount_paid,
            amount_due,
            purchase_order_id,
            branches(name),
            purchase_orders(po_number)
          `
      )
      .eq("supplier_id", supplierId)
      .neq("status", "CANCELLED")
      .order("invoice_date", { ascending: false }),

    supabase
      .from("supplier_payments")
      .select(
        `
            id,
            supplier_invoice_id,
            amount,
            payment_method,
            reference,
            payment_date,
            notes,
            created_at,
            supplier_invoices(invoice_number)
          `
      )
      .eq("supplier_id", supplierId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (invoicesResult.error) {
    throw invoicesResult.error;
  }

  if (paymentsResult.error) {
    throw paymentsResult.error;
  }

  const invoices: SupplierStatementInvoice[] = (invoicesResult.data ?? []).map(
    (invoice) => ({
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_date: invoice.invoice_date,
      due_date: invoice.due_date,
      status: invoice.status,
      total_amount: Number(invoice.total_amount ?? 0),
      amount_paid: Number(invoice.amount_paid ?? 0),
      amount_due: Number(invoice.amount_due ?? 0),
      purchase_order_id: invoice.purchase_order_id,
      po_number: getJoinedString(invoice.purchase_orders, "po_number") || null,
      branch_name: getJoinedString(invoice.branches, "name", "Unknown branch"),
    })
  );

  const payments: SupplierStatementPayment[] = (paymentsResult.data ?? []).map(
    (payment) => ({
      id: payment.id,
      supplier_invoice_id: payment.supplier_invoice_id,
      invoice_number: getJoinedString(
        payment.supplier_invoices,
        "invoice_number",
        "Unknown invoice"
      ),
      amount: Number(payment.amount ?? 0),
      payment_method: payment.payment_method,
      reference: payment.reference,
      payment_date: payment.payment_date,
      notes: payment.notes,
      created_at: payment.created_at,
    })
  );

  const totalInvoiced = invoices.reduce(
    (sum, invoice) => sum + invoice.total_amount,
    0
  );

  const totalPaid = invoices.reduce(
    (sum, invoice) => sum + invoice.amount_paid,
    0
  );

  const outstanding = invoices.reduce(
    (sum, invoice) => sum + invoice.amount_due,
    0
  );

  const overdueInvoices = invoices.filter((invoice) =>
    isOverdue(invoice.due_date, invoice.amount_due, invoice.status)
  );

  const overdue = overdueInvoices.reduce(
    (sum, invoice) => sum + invoice.amount_due,
    0
  );

  const openInvoices = invoices.filter(
    (invoice) =>
      invoice.status === "UNPAID" || invoice.status === "PARTIALLY_PAID"
  ).length;

  return {
    supplier,
    total_invoiced: totalInvoiced,
    total_paid: totalPaid,
    outstanding,
    overdue,
    open_invoices: openInvoices,
    overdue_invoices: overdueInvoices.length,
    invoices,
    payments,
  };
}
