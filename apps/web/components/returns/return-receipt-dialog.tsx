"use client";

import { Printer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  getReturnReceipt,
  type ReturnReceiptData,
} from "@/lib/services/return-receipt";

type ReturnReceiptDialogProps = {
  open: boolean;
  returnId: string | null;
  onClose: () => void;
};

export function ReturnReceiptDialog({
  open,
  returnId,
  onClose,
}: ReturnReceiptDialogProps) {
  const [receipt, setReceipt] = useState<ReturnReceiptData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const receiptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadReceipt() {
      if (!open || !returnId) {
        return;
      }

      setLoading(true);
      setErrorMessage("");
      setReceipt(null);

      try {
        const data = await getReturnReceipt(returnId);
        setReceipt(data);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to load the return receipt."
        );
      } finally {
        setLoading(false);
      }
    }

    void loadReceipt();
  }, [open, returnId]);

  function handleClose() {
    setReceipt(null);
    setErrorMessage("");
    onClose();
  }

  function handlePrint() {
    if (!receiptRef.current || !receipt) {
      return;
    }

    const printWindow = window.open("", "_blank", "width=420,height=760");

    if (!printWindow) {
      setErrorMessage(
        "Unable to open the print window. Please allow pop-ups for this site."
      );
      return;
    }

    printWindow.document.open();

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />

          <title>${receipt.return_number}</title>

          <style>
            @page {
              size: 80mm auto;
              margin: 4mm;
            }

            * {
              box-sizing: border-box;
            }

            html,
            body {
              margin: 0;
              padding: 0;
              background: white;
              color: #111827;
              font-family: Arial, Helvetica, sans-serif;
            }

            body {
              width: 72mm;
              margin: 0 auto;
            }

            .receipt {
              width: 100%;
              font-size: 12px;
              line-height: 1.4;
            }

            .center {
              text-align: center;
            }

            .title {
              margin: 0;
              font-size: 20px;
              font-weight: 700;
            }

            .subtitle {
              margin-top: 4px;
              font-size: 13px;
              font-weight: 700;
            }

            .muted {
              color: #4b5563;
            }

            .divider {
              margin: 14px 0;
              border-top: 1px dashed #9ca3af;
            }

            .row {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin-bottom: 6px;
            }

            .row > :last-child {
              text-align: right;
            }

            .item {
              margin-bottom: 14px;
            }

            .item-name {
              font-weight: 700;
              margin-bottom: 3px;
            }

            .item-meta {
              color: #4b5563;
              font-size: 11px;
            }

            .item-total {
              font-weight: 700;
            }

            .grand-total {
              border-top: 1px solid #111827;
              padding-top: 8px;
              font-size: 17px;
              font-weight: 700;
            }

            .footer {
              margin-top: 16px;
              text-align: center;
            }

            .footer strong {
              display: block;
              margin-bottom: 4px;
            }
          </style>
        </head>

        <body>
          <div class="receipt">
            ${receiptRef.current.innerHTML}
          </div>

          <script>
            window.addEventListener("load", function () {
              window.focus();
              window.print();
            });

            window.addEventListener("afterprint", function () {
              window.close();
            });
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  if (!open) {
    return null;
  }

  const customerName = receipt?.customer
    ? `${receipt.customer.first_name} ${
        receipt.customer.last_name ?? ""
      }`.trim()
    : "Walk-in Customer";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Return Receipt
            </h2>

            <p className="text-sm text-slate-500">
              View or print the completed return.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close return receipt"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && (
          <div className="flex min-h-96 items-center justify-center p-8 text-sm text-slate-500">
            Loading return receipt...
          </div>
        )}

        {!loading && errorMessage && (
          <div className="p-8">
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {errorMessage}
            </div>
          </div>
        )}

        {!loading && receipt && (
          <>
            <div className="px-6 py-8">
              <div
                ref={receiptRef}
                className="mx-auto max-w-sm bg-white text-slate-900"
              >
                <div className="center">
                  <h1 className="title">AlphaPOS</h1>

                  <p className="subtitle">{receipt.organization_name}</p>

                  <p className="muted">{receipt.branch_name}</p>

                  <p className="mt-3 font-semibold">RETURN RECEIPT</p>
                </div>

                <div className="divider" />

                <div>
                  <div className="row">
                    <span className="muted">Return number</span>

                    <strong>{receipt.return_number}</strong>
                  </div>

                  <div className="row">
                    <span className="muted">Original receipt</span>

                    <span>{receipt.original_receipt_number}</span>
                  </div>

                  <div className="row">
                    <span className="muted">Date</span>

                    <span>
                      {new Date(
                        receipt.completed_at ?? receipt.created_at
                      ).toLocaleString("en-GB")}
                    </span>
                  </div>

                  <div className="row">
                    <span className="muted">Processed by</span>

                    <span>{receipt.processed_by_name}</span>
                  </div>

                  <div className="row">
                    <span className="muted">Customer</span>

                    <span>{customerName}</span>
                  </div>

                  <div className="row">
                    <span className="muted">Status</span>

                    <strong>{receipt.status}</strong>
                  </div>
                </div>

                <div className="divider" />

                <div>
                  {receipt.items.map((item) => (
                    <div key={item.id} className="item">
                      <div className="row">
                        <div>
                          <div className="item-name">{item.product_name}</div>

                          <div className="item-meta">SKU: {item.sku}</div>

                          <div className="item-meta">
                            {item.quantity} × £{item.unit_price.toFixed(2)}
                          </div>

                          <div className="item-meta">
                            {item.restock
                              ? "Returned to inventory"
                              : "Not returned to inventory"}
                          </div>
                        </div>

                        <div className="item-total">
                          £{item.line_refund_amount.toFixed(2)}
                        </div>
                      </div>

                      {item.serials.length > 0 && (
                        <div className="mt-2">
                          {item.serials.map((serial) => (
                            <div key={serial.id} className="item-meta">
                              {serial.imei
                                ? `IMEI: ${serial.imei}`
                                : `Serial: ${
                                    serial.serial_number ?? "Unknown"
                                  }`}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="divider" />

                <div>
                  <div className="row">
                    <span className="muted">Refund method</span>

                    <span>
                      {receipt.refund_method?.replaceAll("_", " ") ??
                        "No refund"}
                    </span>
                  </div>

                  <div className="row grand-total">
                    <span>Refund total</span>

                    <span>£{receipt.refund_amount.toFixed(2)}</span>
                  </div>
                </div>

                {receipt.reason && (
                  <>
                    <div className="divider" />

                    <div>
                      <strong>Return reason</strong>

                      <p className="muted">{receipt.reason}</p>
                    </div>
                  </>
                )}

                {receipt.notes && (
                  <>
                    <div className="divider" />

                    <div>
                      <strong>Notes</strong>

                      <p className="muted">{receipt.notes}</p>
                    </div>
                  </>
                )}

                <div className="divider" />

                <div className="footer">
                  <strong>Return processed successfully.</strong>

                  <span className="muted">
                    Please keep this receipt for your records.
                  </span>
                </div>
              </div>
            </div>

            <div className="flex gap-3 border-t px-6 py-4">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 rounded-lg border px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>

              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-slate-900 px-4 py-3 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Printer className="mr-2 h-4 w-4" />
                Print Return Receipt
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
