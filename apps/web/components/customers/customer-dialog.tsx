"use client";

import { useAuth } from "@/components/auth-provider";
import { createCustomer, type CustomerType } from "@/lib/services/customers";
import { Plus, X } from "lucide-react";
import { useState } from "react";

type CustomerDialogProps = {
  onCustomerCreated: () => void;
};

const initialForm = {
  customer_type: "RETAIL" as CustomerType,
  first_name: "",
  last_name: "",
  company_name: "",
  email: "",
  phone: "",
  address_line_1: "",
  address_line_2: "",
  city: "",
  postcode: "",
  country: "United Kingdom",
  notes: "",
};

export function CustomerDialog({ onCustomerCreated }: CustomerDialogProps) {
  const { organization } = useAuth();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState(initialForm);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!organization) {
      setErrorMessage("No organization is currently selected.");
      return;
    }

    if (!form.first_name.trim()) {
      setErrorMessage("First name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage("");

    try {
      await createCustomer({
        organization_id: organization.id,
        customer_type: form.customer_type,
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        company_name: form.company_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        address_line_1: form.address_line_1.trim(),
        address_line_2: form.address_line_2.trim(),
        city: form.city.trim(),
        postcode: form.postcode.trim(),
        country: form.country.trim(),
        notes: form.notes.trim(),
      });

      setForm(initialForm);
      setOpen(false);
      onCustomerCreated();
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Unable to create the customer."
      );
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (saving) {
      return;
    }

    setErrorMessage("");
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Customer
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6">
          <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-start justify-between border-b px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  Add Customer
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  Create a customer record for sales, warranties and repairs.
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                disabled={saving}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
                aria-label="Close customer dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={handleSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
                <div className="space-y-6">
                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Customer type
                    </label>

                    <select
                      value={form.customer_type}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          customer_type: event.target.value as CustomerType,
                        })
                      }
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                    >
                      <option value="RETAIL">Retail</option>
                      <option value="WHOLESALE">Wholesale</option>
                      <option value="CORPORATE">Corporate</option>
                    </select>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        First name
                      </label>

                      <input
                        value={form.first_name}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            first_name: event.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        placeholder="John"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Last name
                      </label>

                      <input
                        value={form.last_name}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            last_name: event.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        placeholder="Smith"
                      />
                    </div>

                    <div className="md:col-span-2">
                      <label className="text-sm font-medium text-slate-700">
                        Company name
                      </label>

                      <input
                        value={form.company_name}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            company_name: event.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        placeholder="Optional company name"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Phone
                      </label>

                      <input
                        value={form.phone}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            phone: event.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        placeholder="07123 456789"
                      />
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700">
                        Email
                      </label>

                      <input
                        type="email"
                        value={form.email}
                        onChange={(event) =>
                          setForm({
                            ...form,
                            email: event.target.value,
                          })
                        }
                        className="mt-1 w-full rounded-lg border px-3 py-2"
                        placeholder="john@example.com"
                      />
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      Address
                    </h3>

                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-slate-700">
                          Address line 1
                        </label>

                        <input
                          value={form.address_line_1}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              address_line_1: event.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border px-3 py-2"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-slate-700">
                          Address line 2
                        </label>

                        <input
                          value={form.address_line_2}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              address_line_2: event.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border px-3 py-2"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          City
                        </label>

                        <input
                          value={form.city}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              city: event.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border px-3 py-2"
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium text-slate-700">
                          Postcode
                        </label>

                        <input
                          value={form.postcode}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              postcode: event.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border px-3 py-2"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-sm font-medium text-slate-700">
                          Country
                        </label>

                        <input
                          value={form.country}
                          onChange={(event) =>
                            setForm({
                              ...form,
                              country: event.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border px-3 py-2"
                        />
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-sm font-medium text-slate-700">
                      Notes
                    </label>

                    <textarea
                      value={form.notes}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          notes: event.target.value,
                        })
                      }
                      rows={4}
                      className="mt-1 w-full rounded-lg border px-3 py-2"
                      placeholder="Optional customer notes"
                    />
                  </div>

                  {errorMessage && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                      {errorMessage}
                    </div>
                  )}
                </div>
              </div>

              <div className="shrink-0 border-t bg-white px-5 py-4 sm:px-6">
                <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={saving}
                    className="rounded-lg border px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Customer"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
