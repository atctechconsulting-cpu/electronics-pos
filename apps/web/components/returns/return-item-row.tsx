"use client";

import { Minus, Plus, RotateCcw } from "lucide-react";

import { Currency, StatusBadge } from "@/components/ui/alpha-components";
import type { SaleDetailItem } from "@/lib/services/sale-details";

export type ReturnItemSelection = {
  sale_item_id: string;
  product_id: string;
  quantity: number;
  restock: boolean;
  serial_ids: string[];
};

type ReturnItemRowProps = {
  item: SaleDetailItem;
  selection: ReturnItemSelection | null;
  disabled?: boolean;
  onChange: (selection: ReturnItemSelection | null) => void;
};

export function ReturnItemRow({
  item,
  selection,
  disabled = false,
  onChange,
}: ReturnItemRowProps) {
  const selected = selection !== null;
  const quantity = selection?.quantity ?? 0;
  const restock = selection?.restock ?? true;
  const selectedSerialIds = selection?.serial_ids ?? [];

  const hasSerials = item.serials.length > 0;

  function createSelection(
    overrides: Partial<ReturnItemSelection> = {}
  ): ReturnItemSelection {
    return {
      sale_item_id: item.id,
      product_id: item.product_id,
      quantity: 1,
      restock: true,
      serial_ids: [],
      ...overrides,
    };
  }

  function handleToggleSelected() {
    if (disabled) {
      return;
    }

    if (selected) {
      onChange(null);
      return;
    }

    onChange(createSelection());
  }

  function updateQuantity(nextQuantity: number) {
    if (!selection || disabled) {
      return;
    }

    const safeQuantity = Math.max(1, Math.min(nextQuantity, item.quantity));

    let nextSerialIds = selection.serial_ids;

    if (hasSerials && nextSerialIds.length > safeQuantity) {
      nextSerialIds = nextSerialIds.slice(0, safeQuantity);
    }

    onChange({
      ...selection,
      quantity: safeQuantity,
      serial_ids: nextSerialIds,
    });
  }

  function handleRestockChange(event: React.ChangeEvent<HTMLInputElement>) {
    if (!selection || disabled) {
      return;
    }

    onChange({
      ...selection,
      restock: event.target.checked,
    });
  }

  function toggleSerial(serialId: string) {
    if (!selection || disabled) {
      return;
    }

    const alreadySelected = selectedSerialIds.includes(serialId);

    if (alreadySelected) {
      onChange({
        ...selection,
        serial_ids: selectedSerialIds.filter((id) => id !== serialId),
      });

      return;
    }

    if (selectedSerialIds.length >= selection.quantity) {
      return;
    }

    onChange({
      ...selection,
      serial_ids: [...selectedSerialIds, serialId],
    });
  }

  return (
    <div
      className={`rounded-xl border transition ${
        selected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-start gap-4 p-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={handleToggleSelected}
          disabled={disabled}
          className="mt-1 h-4 w-4 rounded border-slate-300"
          aria-label={`Select ${item.product_name} for return`}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-col justify-between gap-3 sm:flex-row">
            <div>
              <h3 className="font-semibold text-slate-900">
                {item.product_name}
              </h3>

              <p className="mt-1 text-sm text-slate-500">SKU: {item.sku}</p>

              <p className="mt-2 text-sm text-slate-600">
                Sold quantity: {item.quantity}
              </p>
            </div>

            <div className="sm:text-right">
              <p className="text-sm text-slate-500">Unit price</p>

              <Currency
                amount={item.unit_price}
                className="mt-1 block font-semibold text-slate-900"
              />
            </div>
          </div>

          {selected && selection && (
            <div className="mt-5 space-y-5 border-t pt-5">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <p className="text-sm font-medium text-slate-700">
                    Return quantity
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Maximum {item.quantity}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => updateQuantity(quantity - 1)}
                    disabled={disabled || quantity <= 1}
                    className="rounded-lg border p-2 text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Decrease return quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </button>

                  <span className="w-8 text-center font-semibold text-slate-900">
                    {quantity}
                  </span>

                  <button
                    type="button"
                    onClick={() => updateQuantity(quantity + 1)}
                    disabled={disabled || quantity >= item.quantity}
                    className="rounded-lg border p-2 text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label="Increase return quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-lg border bg-white p-3">
                <input
                  type="checkbox"
                  checked={restock}
                  onChange={handleRestockChange}
                  disabled={disabled}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />

                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-slate-900">
                    <RotateCcw className="h-4 w-4" />
                    Return to inventory
                  </p>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Turn this off when the returned item is damaged, faulty, or
                    should not be sold again.
                  </p>
                </div>
              </label>

              {hasSerials && (
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        Select IMEI / serial numbers
                      </p>

                      <p className="mt-1 text-xs text-slate-500">
                        Select exactly {quantity} identifier
                        {quantity === 1 ? "" : "s"}.
                      </p>
                    </div>

                    <StatusBadge
                      status={
                        selectedSerialIds.length === quantity
                          ? "COMPLETED"
                          : "PENDING"
                      }
                    />
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {item.serials.map((serial) => {
                      const serialSelected = selectedSerialIds.includes(
                        serial.id
                      );

                      const identifier =
                        serial.imei || serial.serial_number || "No identifier";

                      return (
                        <button
                          key={serial.id}
                          type="button"
                          onClick={() => toggleSerial(serial.id)}
                          disabled={
                            disabled ||
                            (!serialSelected &&
                              selectedSerialIds.length >= quantity)
                          }
                          className={`rounded-lg border p-3 text-left transition ${
                            serialSelected
                              ? "border-slate-900 bg-white ring-1 ring-slate-900"
                              : "border-slate-200 bg-white hover:border-slate-400"
                          } disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                          <p className="break-all font-mono text-sm font-medium text-slate-900">
                            {identifier}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {serial.imei ? "IMEI" : "Serial"} · {serial.status}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-between rounded-lg bg-white p-3 text-sm">
                <span className="text-slate-500">Line refund</span>

                <Currency
                  amount={item.unit_price * quantity}
                  className="font-semibold text-slate-900"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
