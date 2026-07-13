import { usePos } from "@/components/pos/pos-provider";

export function PosSummary() {
  const { basket, subtotal, vat, total } = usePos();

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="space-y-3">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <strong>£{subtotal.toFixed(2)}</strong>
        </div>

        <div className="flex justify-between">
          <span>VAT</span>
          <strong>£{vat.toFixed(2)}</strong>
        </div>

        <div className="mt-4 rounded-lg bg-slate-900 p-4 text-white">
          <div className="flex justify-between text-xl font-bold">
            <span>Total</span>
            <span>£{total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <button
        disabled={basket.length === 0}
        className="mt-6 w-full rounded-lg bg-slate-900 py-3 text-white disabled:opacity-50"
      >
        Take Payment
      </button>
    </div>
  );
}
