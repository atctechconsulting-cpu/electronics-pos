"use client";

import { Search, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { usePos } from "@/components/pos/pos-provider";
import { searchCustomers, type Customer } from "@/lib/services/customers";

export function CustomerSelector() {
  const { organization } = useAuth();

  const { selectedCustomer, setSelectedCustomer } = usePos();

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadCustomers() {
      if (!open || !organization) {
        return;
      }

      setLoading(true);
      setErrorMessage("");

      try {
        const data = await searchCustomers(organization.id, search);

        setCustomers(data);
      } catch (error: unknown) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to load customers."
        );
      } finally {
        setLoading(false);
      }
    }

    const timer = window.setTimeout(() => {
      void loadCustomers();
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [open, organization, search]);

  function selectCustomer(customer: Customer) {
    setSelectedCustomer(customer);
    setSearch("");
    setOpen(false);
  }

  function selectWalkInCustomer() {
    setSelectedCustomer(null);
    setSearch("");
    setOpen(false);
  }

  const customerName = selectedCustomer
    ? `${selectedCustomer.first_name} ${
        selectedCustomer.last_name ?? ""
      }`.trim()
    : "Walk-in Customer";

  return (
    <>
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-lg bg-slate-100 p-2">
              <UserRound className="h-5 w-5 text-slate-700" />
            </div>

            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                Customer
              </p>

              <p className="mt-1 truncate font-semibold text-slate-900">
                {customerName}
              </p>

              {selectedCustomer ? (
                <p className="mt-1 truncate text-sm text-slate-500">
                  {selectedCustomer.phone ||
                    selectedCustomer.email ||
                    selectedCustomer.customer_code}
                </p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  Sale will not be linked to a customer account.
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg border px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {selectedCustomer ? "Change" : "Select"}
          </button>
        </div>

        {selectedCustomer && (
          <button
            type="button"
            onClick={() => setSelectedCustomer(null)}
            className="mt-4 text-sm font-medium text-red-600 hover:text-red-700"
          >
            Use Walk-in Customer
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6">
          <div className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between border-b px-5 py-4">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Select Customer
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Search by name, phone, email, company or customer code.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                aria-label="Close customer selector"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="shrink-0 border-b p-4">
              <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
                <Search className="h-4 w-4 text-slate-400" />

                <input
                  autoFocus
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="Search customers..."
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <button
                type="button"
                onClick={selectWalkInCustomer}
                className="mb-3 w-full rounded-xl border p-4 text-left hover:border-slate-400 hover:bg-slate-50"
              >
                <p className="font-medium text-slate-900">Walk-in Customer</p>

                <p className="mt-1 text-sm text-slate-500">
                  Complete the sale without linking a customer account.
                </p>
              </button>

              {errorMessage && (
                <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}

              {loading ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  Loading customers...
                </div>
              ) : customers.length === 0 ? (
                <div className="py-10 text-center text-sm text-slate-500">
                  No matching customers found.
                </div>
              ) : (
                <div className="space-y-3">
                  {customers.map((customer) => {
                    const fullName = `${customer.first_name} ${
                      customer.last_name ?? ""
                    }`.trim();

                    return (
                      <button
                        key={customer.id}
                        type="button"
                        onClick={() => selectCustomer(customer)}
                        className="w-full rounded-xl border p-4 text-left hover:border-slate-400 hover:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="font-medium text-slate-900">
                              {fullName}
                            </p>

                            {customer.company_name && (
                              <p className="mt-1 text-sm text-slate-500">
                                {customer.company_name}
                              </p>
                            )}

                            <p className="mt-2 text-sm text-slate-600">
                              {customer.phone ||
                                customer.email ||
                                "No contact details"}
                            </p>
                          </div>

                          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                            {customer.customer_code}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
