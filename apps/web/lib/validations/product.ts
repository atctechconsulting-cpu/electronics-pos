import { z } from "zod";

export const productSchema = z.object({
  organization_id: z.string().uuid(),

  category_id: z.string().uuid().nullable().optional(),
  brand_id: z.string().uuid().nullable().optional(),
  supplier_id: z.string().uuid().nullable().optional(),

  name: z.string().min(2, "Product name is required"),
  sku: z.string().min(2, "SKU is required"),
  barcode: z.string().optional().nullable(),

  description: z.string().optional().nullable(),

  cost_price: z.coerce.number().min(0),
  retail_price: z.coerce.number().min(0),
  wholesale_price: z.coerce.number().min(0),

  track_inventory: z.boolean().default(true),
  is_serialized: z.boolean().default(false),
  requires_imei: z.boolean().default(false),

  warranty_months: z.coerce.number().int().min(0).default(12),

  main_image_url: z.string().url().optional().nullable(),

  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
});

export type ProductFormValues = z.infer<typeof productSchema>;
