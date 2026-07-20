"use client";

import { PaymentDialog } from "@/components/pos/payment-dialog";
import { usePos } from "@/components/pos/pos-provider";
import { useState } from "react";

export function PosSummary() {
  const { basket, subtotal, vat, total } = usePos();
  const [paymentOpen, setPaymentOpen] = useState(false);

  return (
    <>
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-slate-500">Net amount</span>
            <strong>£{subtotal.toFixed(2)}</strong>
          </div>

          <div className="flex justify-between text-sm">
            <span className="text-slate-500">VAT included</span>
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
          type="button"
          onClick={() => setPaymentOpen(true)}
          disabled={basket.length === 0}
          className="mt-6 w-full rounded-lg bg-slate-900 py-3 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Take Payment
        </button>
      </div>

      <PaymentDialog open={paymentOpen} onClose={() => setPaymentOpen(false)} />
    </>
  );
}
