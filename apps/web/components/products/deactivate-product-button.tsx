"use client";

import { deactivateProduct } from "@/lib/services/products";

type Props = {
  productId: string;
  onSuccess: () => void;
};

export function DeactivateProductButton({
  productId,
  onSuccess,
}: Props) {
  async function handleDeactivate() {
    const confirmed = window.confirm(
      "Deactivate this product?"
    );

    if (!confirmed) return;

    try {
      await deactivateProduct(productId);
      onSuccess();
    } catch (err) {
      console.error(err);
      alert("Unable to deactivate product.");
    }
  }

  return (
    <button
      onClick={handleDeactivate}
      className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
    >
      Deactivate
    </button>
  );
}