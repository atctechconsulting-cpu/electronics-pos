import { supabase } from "@/lib/supabase/client";

export async function getCategories(organizationId: string) {
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .eq("organization_id", organizationId)
    .order("name");

  if (error) throw error;
  return data;
}

export async function createCategory(values: {
  organization_id: string;
  name: string;
  slug: string;
  description?: string | null;
}) {
  const { data, error } = await supabase
    .from("categories")
    .insert(values)
    .select()
    .single();

  if (error) throw error;
  return data;
}