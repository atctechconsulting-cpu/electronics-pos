"use client";

import { Basket } from "@/components/pos/basket";
import { PosProvider } from "@/components/pos/pos-provider";
import { PosSummary } from "@/components/pos/pos-summary";
import { ProductSearch } from "@/components/pos/product-search";

function PosWorkspace() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Point of Sale</h1>
        <p className="text-sm text-slate-500">
          Fast checkout for in-store sales.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ProductSearch />
        </div>

        <div className="space-y-6">
          <Basket />
          <PosSummary />
        </div>
      </div>
    </div>
  );
}

export default function PosPage() {
  return (
    <PosProvider>
      <PosWorkspace />
    </PosProvider>
  );
}
