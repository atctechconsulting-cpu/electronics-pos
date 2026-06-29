import { supabase } from "@/lib/supabase/client";
import { productSchema, type ProductFormValues } from "@/lib/validations/product";

export async function getProducts(organizationId: string) {
  const { data, error } = await supabase
    .from("products")
    .select(`
      *,
      categories:category_id (id, name),
      brands:brand_id (id, name),
      suppliers:supplier_id (id, name)
    `)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data;
}

export async function createProduct(values: ProductFormValues) {
  const parsed = productSchema.parse(values);

  const { data, error } = await supabase
    .from("products")
    .insert(parsed)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function updateProduct(id: string, values: ProductFormValues) {
  const parsed = productSchema.parse(values);

  const { data, error } = await supabase
    .from("products")
    .update(parsed)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;

  return data;
}

export async function deactivateProduct(id: string) {
  const { error } = await supabase
    .from("products")
    .update({ is_active: false })
    .eq("id", id);

  if (error) throw error;
}