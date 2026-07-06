import { supabase } from "@/lib/supabase/client";

export async function globalSearch(organizationId: string, query: string) {
  const search = query.trim();

  if (!search) {
    return {
      products: [],
      categories: [],
      brands: [],
    };
  }

  const [products, categories, brands] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, barcode")
      .eq("organization_id", organizationId)
      .or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`)
      .limit(5),

    supabase
      .from("categories")
      .select("id, name")
      .eq("organization_id", organizationId)
      .ilike("name", `%${search}%`)
      .limit(5),

    supabase
      .from("brands")
      .select("id, name")
      .eq("organization_id", organizationId)
      .ilike("name", `%${search}%`)
      .limit(5),
  ]);

  if (products.error) throw products.error;
  if (categories.error) throw categories.error;
  if (brands.error) throw brands.error;

  return {
    products: products.data ?? [],
    categories: categories.data ?? [],
    brands: brands.data ?? [],
  };
}