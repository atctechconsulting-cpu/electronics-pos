"use client";

import { useAuth } from "@/components/auth-provider";
import { getReceipt, type ReceiptData } from "@/lib/services/receipt";
import { Printer, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type ReceiptDialogProps = {
  open: boolean;
  saleId: string | null;
  onClose: () => void;
  historyBranchId?: string;
};

export function ReceiptDialog({ open, saleId, onClose, historyBranchId }: ReceiptDialogProps) {
  const { organization, branch, historicalBranches, historicalReadPermissions, switchingContext, accessLoading } = useAuth();
  const receiptBranch = historyBranchId === undefined ? branch : historicalBranches.find(item =>
    item.id === historyBranchId && item.organization_id === organization?.id &&
    historicalReadPermissions[item.id]?.includes("sales.view"));
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const receiptRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadReceipt() {
      if (
        !open ||
        !saleId ||
        !organization ||
        !receiptBranch ||
        switchingContext ||
        accessLoading
      ) {
        setReceipt(null);
        setErrorMessage("");

        setLoading(Boolean(open && (switchingContext || accessLoading)));

        return;
      }

      setLoading(true);
      setErrorMessage("");
      setReceipt(null);

      try {
        const data = await getReceipt(saleId, {
          organizationId: organization.id,
          branchId: receiptBranch.id,
        });

        if (!cancelled) setReceipt(data);
      } catch (error: unknown) {
        if (cancelled) return;
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load the receipt."
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReceipt();
    return () => { cancelled = true; };
  }, [open, saleId, organization, receiptBranch, switchingContext, accessLoading]);

  function handlePrint() {
    if (!receiptRef.current || !receipt) return;

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

          <title>${receipt.receipt_number}</title>

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
              font-family:
                Arial,
                Helvetica,
                sans-serif;
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
              font-size: 20px;
              font-weight: 700;
              margin: 0;
            }

            .business-name {
              font-size: 13px;
              font-weight: 700;
              margin-top: 4px;
            }

            .muted {
              color: #4b5563;
            }

            .divider {
              border-top: 1px dashed #9ca3af;
              margin: 14px 0;
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
              font-size: 17px;
              font-weight: 700;
              padding-top: 8px;
              border-top: 1px solid #111827;
            }

            .footer {
              text-align: center;
              margin-top: 16px;
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

  function handleClose() {
    setReceipt(null);
    setErrorMessage("");
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4 py-8">
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Sales Receipt
            </h2>

            <p className="text-sm text-slate-500">
              View or print the completed sale.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close receipt"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loading && (
          <div className="flex min-h-96 items-center justify-center p-8 text-sm text-slate-500">
            Loading receipt...
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

                  <p className="business-name">{receipt.organization_name}</p>

                  <p className="muted">{receipt.branch_name}</p>
                </div>

                <div className="divider" />

                <div>
                  <div className="row">
                    <span className="muted">Receipt</span>
                    <strong>{receipt.receipt_number}</strong>
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
                    <span className="muted">Cashier</span>
                    <span>{receipt.cashier_name}</span>
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
                        </div>

                        <div className="item-total">
                          £{item.line_total.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="divider" />

                <div>
                  <div className="row">
                    <span className="muted">Net amount</span>
                    <span>£{receipt.subtotal.toFixed(2)}</span>
                  </div>

                  <div className="row">
                    <span className="muted">VAT included</span>
                    <span>£{receipt.vat_amount.toFixed(2)}</span>
                  </div>

                  {receipt.discount_amount > 0 && (
                    <div className="row">
                      <span className="muted">Discount</span>
                      <span>-£{receipt.discount_amount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="row grand-total">
                    <span>Total</span>
                    <span>£{receipt.total_amount.toFixed(2)}</span>
                  </div>
                </div>

                <div className="divider" />

                <div>
                  <strong>Payment</strong>

                  <div className="mt-3">
                    {receipt.payments.map((payment) => (
                      <div key={payment.id} className="row">
                        <div>
                          <div>
                            {payment.payment_method.replaceAll("_", " ")}
                          </div>

                          {payment.reference && (
                            <div className="item-meta">
                              Ref: {payment.reference}
                            </div>
                          )}
                        </div>

                        <strong>£{payment.amount.toFixed(2)}</strong>
                      </div>
                    ))}
                  </div>
                </div>

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
                  <strong>Thank you for shopping with us.</strong>

                  <span className="muted">
                    Please keep this receipt for returns and warranty enquiries.
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
                Print Receipt
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
