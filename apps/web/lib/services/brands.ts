import { supabase } from "@/lib/supabase/client";

export async function getBrands(organizationId: string) {
  const { data, error } = await supabase
    .from("brands")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw error;

  return data;
}

export async function createBrand(values: {
  organization_id: string;
  name: string;
  slug: string;
  description?: string | null;
}) {
  const { data, error } = await supabase
    .from("brands")
    .insert(values)
    .select()
    .single();

  if (error) throw error;

  return data;
}