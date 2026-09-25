"use client";

import { CheckCircle2, PackageCheck, Smartphone, X } from "lucide-react";
import { useMemo, useState } from "react";

import {
  receivePurchaseOrderGoods,
  type PurchaseOrderDetails,
  type ReceivePurchaseOrderItem,
} from "@/lib/services/purchase-orders";

import { IMEI_ERROR, isValidImei } from "@/lib/validations/imei";

type ReceiveLineState = {
  quantity: number;
  identifiers: string[];
};

type ReceivePurchaseOrderDialogProps = {
  purchaseOrder: PurchaseOrderDetails;
  onSuccess: () => void;
};

export function ReceivePurchaseOrderDialog({
  purchaseOrder,
  onSuccess,
}: ReceivePurchaseOrderDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const receivableItems = useMemo(
    () =>
      purchaseOrder.items.filter(
        (item) => item.received_quantity < item.quantity
      ),
    [purchaseOrder.items]
  );

  const createInitialLines = () =>
    Object.fromEntries(
      receivableItems.map((item) => [
        item.id,
        {
          quantity: 0,
          identifiers: [],
        },
      ])
    ) as Record<string, ReceiveLineState>;

  const [lines, setLines] =
    useState<Record<string, ReceiveLineState>>(createInitialLines);

  function resetForm() {
    setLines(createInitialLines());
    setNotes("");
    setError(null);
  }

  function handleOpen() {
    resetForm();
    setOpen(true);
  }

  function handleClose() {
    if (loading) return;

    setOpen(false);
    resetForm();
  }

  function updateQuantity(itemId: string, quantity: number) {
    const safeQuantity = Math.max(0, quantity);

    setLines((current) => {
      const previous = current[itemId] ?? {
        quantity: 0,
        identifiers: [],
      };

      return {
        ...current,
        [itemId]: {
          quantity: safeQuantity,
          identifiers: Array.from(
            { length: safeQuantity },
            (_, index) => previous.identifiers[index] ?? ""
          ),
        },
      };
    });
  }

  function updateIdentifier(itemId: string, index: number, value: string) {
    setLines((current) => {
      const previous = current[itemId] ?? {
        quantity: 0,
        identifiers: [],
      };

      const identifiers = [...previous.identifiers];

      identifiers[index] = value;

      return {
        ...current,
        [itemId]: {
          ...previous,
          identifiers,
        },
      };
    });
  }

  const totalUnitsSelected = useMemo(
    () => Object.values(lines).reduce((sum, line) => sum + line.quantity, 0),
    [lines]
  );

  async function handleReceive() {
    setError(null);

    const selectedItems: ReceivePurchaseOrderItem[] = [];

    for (const item of receivableItems) {
      const line = lines[item.id];

      if (!line || line.quantity <= 0) {
        continue;
      }

      const remaining = item.quantity - item.received_quantity;

      if (line.quantity > remaining) {
        setError(
          `${item.product_name}: you can only receive ${remaining} remaining unit${
            remaining === 1 ? "" : "s"
          }.`
        );
        return;
      }

      if (item.is_serialized || item.requires_imei) {
        const identifiers = line.identifiers.map((value) => value.trim());

        if (
          identifiers.length !== line.quantity ||
          identifiers.some((value) => !value)
        ) {
          setError(
            `${item.product_name}: enter exactly ${line.quantity} ${
              item.requires_imei ? "IMEI" : "serial number"
            } value${line.quantity === 1 ? "" : "s"}.`
          );
          return;
        }

        if (item.requires_imei && identifiers.some(value => !isValidImei(value))) {
          setError(`${item.product_name}: ${IMEI_ERROR}`);
          return;
        }

        const uniqueValues = new Set(
          identifiers.map((value) => value.toLowerCase())
        );

        if (uniqueValues.size !== identifiers.length) {
          setError(
            `${item.product_name}: duplicate ${
              item.requires_imei ? "IMEI" : "serial number"
            } values were entered.`
          );
          return;
        }

        selectedItems.push({
          purchase_order_item_id: item.id,
          quantity: line.quantity,
          identifiers: identifiers.map((value) =>
            item.requires_imei
              ? {
                  imei: value,
                  serial_number: null,
                }
              : {
                  serial_number: value,
                  imei: null,
                }
          ),
        });

        continue;
      }

      selectedItems.push({
        purchase_order_item_id: item.id,
        quantity: line.quantity,
      });
    }

    if (!selectedItems.length) {
      setError("Enter a receiving quantity for at least one product.");
      return;
    }

    try {
      setLoading(true);

      const result = await receivePurchaseOrderGoods(
        purchaseOrder.id,
        selectedItems,
        notes
      );

      setOpen(false);
      resetForm();

      alert(
        `${result.received_units} unit${
          result.received_units === 1 ? "" : "s"
        } received successfully. Purchase order status: ${result.status.replace(
          "_",
          " "
        )}.`
      );

      onSuccess();
    } catch (receiveError) {
      setError(
        receiveError instanceof Error
          ? receiveError.message
          : "Unable to receive goods."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        disabled={!receivableItems.length}
        className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <PackageCheck className="h-4 w-4" />
        Receive Goods
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-start justify-between border-b px-6 py-5">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">
                  Receive Goods
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {purchaseOrder.po_number} · {purchaseOrder.supplier_name}
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {error && (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                {receivableItems.map((item) => {
                  const remaining = item.quantity - item.received_quantity;

                  const line = lines[item.id] ?? {
                    quantity: 0,
                    identifiers: [],
                  };

                  const tracked = item.is_serialized || item.requires_imei;

                  const identifierLabel = item.requires_imei
                    ? "IMEI"
                    : "Serial Number";

                  return (
                    <div
                      key={item.id}
                      className="rounded-xl border border-slate-200"
                    >
                      <div className="grid gap-4 p-4 md:grid-cols-[1fr_150px]">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-950">
                              {item.product_name}
                            </p>

                            {tracked && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                                <Smartphone className="h-3 w-3" />
                                {item.requires_imei
                                  ? "IMEI tracked"
                                  : "Serialized"}
                              </span>
                            )}
                          </div>

                          <p className="mt-1 text-sm text-slate-500">
                            SKU: {item.sku}
                          </p>

                          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                            <span>Ordered: {item.quantity}</span>

                            <span>
                              Already received: {item.received_quantity}
                            </span>

                            <span className="font-medium text-slate-700">
                              Remaining: {remaining}
                            </span>
                          </div>
                        </div>

                        <div>
                          <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                            Receive now
                          </label>

                          <input
                            type="number"
                            min="0"
                            max={remaining}
                            value={line.quantity}
                            onChange={(event) =>
                              updateQuantity(
                                item.id,
                                Math.min(
                                  remaining,
                                  Math.max(0, Number(event.target.value) || 0)
                                )
                              )
                            }
                            className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                          />
                        </div>
                      </div>

                      {tracked && line.quantity > 0 && (
                        <div className="border-t bg-slate-50 px-4 py-4">
                          <p className="text-sm font-medium text-slate-800">
                            {identifierLabel} details
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            Enter one {identifierLabel.toLowerCase()} for every
                            unit being received.
                          </p>

                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {Array.from(
                              {
                                length: line.quantity,
                              },
                              (_, index) => (
                                <div key={index}>
                                  <label className="text-xs font-medium text-slate-600">
                                    {identifierLabel} {index + 1}
                                  </label>

                                  <input
                                    value={line.identifiers[index] ?? ""}
                                    onChange={(event) =>
                                      updateIdentifier(
                                        item.id,
                                        index,
                                        event.target.value
                                      )
                                    }
                                    placeholder={`Enter ${identifierLabel.toLowerCase()}`}
                                    className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                                  />
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5">
                <label className="text-sm font-medium text-slate-700">
                  Receiving notes
                </label>

                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  placeholder="Optional notes about this delivery"
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
                />
              </div>

              <div className="mt-5 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-slate-700" />

                  <div>
                    <p className="text-sm font-medium text-slate-900">
                      Receiving summary
                    </p>

                    <p className="text-sm text-slate-500">
                      {totalUnitsSelected} unit
                      {totalUnitsSelected === 1 ? "" : "s"} selected for this
                      delivery.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t bg-white px-6 py-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleReceive}
                disabled={loading || totalUnitsSelected === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PackageCheck className="h-4 w-4" />

                {loading ? "Receiving..." : "Confirm Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
