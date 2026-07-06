import { supabase } from "@/lib/supabase/client";

export async function getSuppliers(organizationId: string) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw error;
  return data;
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