"use client";

import {
  Banknote,
  Building2,
  CreditCard,
  Gift,
  WalletCards,
} from "lucide-react";

export type RefundMethod =
  "CASH" | "CARD" | "BANK_TRANSFER" | "STORE_CREDIT" | "NO_REFUND";

type RefundMethodSelectorProps = {
  value: RefundMethod;
  onChange: (method: RefundMethod) => void;
  disabled?: boolean;
};

const methods: {
  value: RefundMethod;
  label: string;
  description: string;
  icon: typeof Banknote;
}[] = [
  {
    value: "CASH",
    label: "Cash",
    description: "Refund the customer in cash.",
    icon: Banknote,
  },
  {
    value: "CARD",
    label: "Card",
    description: "Refund back to the customer’s card.",
    icon: CreditCard,
  },
  {
    value: "BANK_TRANSFER",
    label: "Bank Transfer",
    description: "Refund directly to a bank account.",
    icon: Building2,
  },
  {
    value: "STORE_CREDIT",
    label: "Store Credit",
    description: "Issue credit for a future purchase.",
    icon: WalletCards,
  },
  {
    value: "NO_REFUND",
    label: "No Refund",
    description: "Record the return without refunding money.",
    icon: Gift,
  },
];

export function RefundMethodSelector({
  value,
  onChange,
  disabled = false,
}: RefundMethodSelectorProps) {
  return (
    <div>
      <p className="text-sm font-medium text-slate-700">Refund method</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {methods.map((method) => {
          const Icon = method.icon;
          const selected = value === method.value;

          return (
            <button
              key={method.value}
              type="button"
              onClick={() => onChange(method.value)}
              disabled={disabled}
              className={`rounded-xl border p-4 text-left transition ${
                selected
                  ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                  : "border-slate-200 hover:border-slate-400 hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-slate-100 p-2">
                  <Icon className="h-5 w-5 text-slate-700" />
                </div>

                <div>
                  <p className="font-medium text-slate-900">{method.label}</p>

                  <p className="mt-1 text-sm leading-5 text-slate-500">
                    {method.description}
                  </p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
