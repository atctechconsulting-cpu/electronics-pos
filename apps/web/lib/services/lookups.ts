import { supabase } from "@/lib/supabase/client";

export async function getCategoryOptions(organizationId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;

  return data;
}

export async function getBrandOptions(organizationId: string) {
  const { data, error } = await supabase
    .from("brands")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;

  return data;
}

export async function getSupplierOptions(organizationId: string) {
  const { data, error } = await supabase
    .from("suppliers")
    .select("id, name")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;

  return data;
}