import { supabase } from "@/lib/supabase/client";

export type CustomerType = "RETAIL" | "WHOLESALE" | "CORPORATE";

export type Customer = {
  id: string;
  organization_id: string;
  customer_code: string;
  customer_type: CustomerType;

  first_name: string;
  last_name: string | null;

  company_name: string | null;

  email: string | null;
  phone: string | null;

  address_line_1: string | null;
  address_line_2: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;

  notes: string | null;

  is_active: boolean;

  created_at: string;
};

export type CreateCustomerInput = {
  organization_id: string;

  customer_type: CustomerType;

  first_name: string;
  last_name?: string;

  company_name?: string;

  email?: string;
  phone?: string;

  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  postcode?: string;
  country?: string;

  notes?: string;
};

export async function listCustomers(
  organizationId: string
): Promise<Customer[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("first_name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Customer[];
}

export async function searchCustomers(
  organizationId: string,
  search: string
): Promise<Customer[]> {
  if (!search.trim()) {
    return listCustomers(organizationId);
  }

  const query = `%${search.trim()}%`;

  const { data, error } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .or(
      [
        `first_name.ilike.${query}`,
        `last_name.ilike.${query}`,
        `company_name.ilike.${query}`,
        `phone.ilike.${query}`,
        `email.ilike.${query}`,
        `customer_code.ilike.${query}`,
      ].join(",")
    )
    .order("first_name");

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Customer[];
}

export async function createCustomer(input: CreateCustomerInput) {
  const { data: code, error: codeError } = await supabase.rpc(
    "generate_customer_code",
    {
      p_organization_id: input.organization_id,
    }
  );

  if (codeError) {
    throw new Error(codeError.message);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("customers")
    .insert({
      ...input,

      customer_code: code,

      created_by: user?.id,

      last_name: input.last_name || null,
      company_name: input.company_name || null,

      email: input.email || null,
      phone: input.phone || null,

      address_line_1: input.address_line_1 || null,
      address_line_2: input.address_line_2 || null,
      city: input.city || null,
      postcode: input.postcode || null,
      country: input.country || "United Kingdom",

      notes: input.notes || null,
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function updateCustomer(
  id: string,
  updates: Partial<CreateCustomerInput>
) {
  const { data, error } = await supabase
    .from("customers")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

export async function deactivateCustomer(id: string) {
  const { error } = await supabase
    .from("customers")
    .update({
      is_active: false,
    })
    .eq("id", id);

  if (error) {
    throw new Error(error.message);
  }
}
