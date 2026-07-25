"use client";

import { Mail, Phone, Search, User } from "lucide-react";
import { useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { CustomerDialog } from "@/components/customers/customer-dialog";
import { searchCustomers, type Customer } from "@/lib/services/customers";

export default function CustomersPage() {
  const { organization } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  async function loadCustomers(searchValue = search) {
    if (!organization) {
      return;
    }

    setLoading(true);
    setErrorMessage("");

    try {
      const data = await searchCustomers(organization.id, searchValue);

      setCustomers(data);
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to load customers."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!organization) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadCustomers(search);
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [organization, search]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Customers</h1>

          <p className="mt-1 text-slate-500">
            Manage retail, wholesale and corporate customers.
          </p>
        </div>

        <CustomerDialog onCustomerCreated={() => loadCustomers(search)} />
      </div>

      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b p-4">
          <div className="flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-full bg-transparent text-sm outline-none"
              placeholder="Search by name, phone, email, company or customer code..."
            />
          </div>
        </div>

        {errorMessage && (
          <div className="border-b border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {loading ? (
          <div className="p-8 text-center text-slate-500">
            Loading customers...
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center">
            <User className="mx-auto h-12 w-12 text-slate-300" />

            <h2 className="mt-4 text-lg font-semibold text-slate-900">
              {search.trim() ? "No matching customers" : "No customers yet"}
            </h2>

            <p className="mt-2 text-sm text-slate-500">
              {search.trim()
                ? "Try another name, phone number, email or customer code."
                : "Your customers will appear here once they have been created."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-slate-50 text-slate-500">
                <tr className="text-left">
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Type</th>
                  <th className="px-6 py-4">Contact</th>
                  <th className="px-6 py-4">Code</th>
                </tr>
              </thead>

              <tbody>
                {customers.map((customer) => (
                  <tr key={customer.id} className="border-b last:border-0">
                    <td className="px-6 py-4">
                      <div className="font-medium text-slate-900">
                        {customer.first_name} {customer.last_name ?? ""}
                      </div>

                      {customer.company_name && (
                        <div className="mt-1 text-sm text-slate-500">
                          {customer.company_name}
                        </div>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                        {customer.customer_type}
                      </span>
                    </td>

                    <td className="px-6 py-4">
                      <div className="space-y-1 text-sm text-slate-600">
                        {customer.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="h-3 w-3" />
                            {customer.phone}
                          </div>
                        )}

                        {customer.email && (
                          <div className="flex items-center gap-2">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </div>
                        )}

                        {!customer.phone && !customer.email && (
                          <span className="text-slate-400">No contact</span>
                        )}
                      </div>
                    </td>

                    <td className="px-6 py-4 font-mono text-sm text-slate-600">
                      {customer.customer_code}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
