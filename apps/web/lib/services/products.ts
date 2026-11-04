import { withCosts } from "@/lib/services/financial-projections";
import { supabase } from "@/lib/supabase/client";
import {
  productSchema,
  type ProductFormValues,
} from "@/lib/validations/product";

export async function getProducts(organizationId: string, purchasingBranchId?: string) {
  const { data, error } = await supabase
    .from("products")
    .select(
      `
      id,organization_id,category_id,brand_id,supplier_id,name,sku,barcode,description,retail_price,wholesale_price,track_inventory,is_serialized,requires_imei,warranty_months,main_image_url,is_active,is_featured,created_at,updated_at,
      categories:category_id (id, name),
      brands:brand_id (id, name),
      suppliers:supplier_id (id, name)
    `
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return withCosts(data ?? [], organizationId, purchasingBranchId ?? null, purchasingBranchId ? "purchase_products" : "products", "cost_price");
}

export async function createProduct(values: ProductFormValues) {
  const parsed = productSchema.parse(values);

  const { data, error } = await supabase
    .from("products")
    .insert(parsed)
    .select("id,organization_id,category_id,brand_id,supplier_id,name,sku,barcode,description,retail_price,wholesale_price,track_inventory,is_serialized,requires_imei,warranty_months,main_image_url,is_active,is_featured,created_at,updated_at")
    .single();

  if (error) throw error;

  return data;
}

export async function updateProduct(id: string, values: Omit<ProductFormValues, "cost_price"> & { cost_price?: number }) {
  const parsed = productSchema.partial({ cost_price: true }).parse(values);

  const { data, error } = await supabase
    .from("products")
    .update((({ organization_id: _organizationId, ...updates }) => updates)(parsed))
    .eq("id", id)
    .eq("organization_id", parsed.organization_id)
    .select("id,organization_id,category_id,brand_id,supplier_id,name,sku,barcode,description,retail_price,wholesale_price,track_inventory,is_serialized,requires_imei,warranty_months,main_image_url,is_active,is_featured,created_at,updated_at")
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
