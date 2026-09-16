"use client";

import {
  ArrowLeft,
  Building2,
  FileText,
  Globe2,
  Mail,
  MapPin,
  Phone,
  ReceiptText,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { PageHeader, SectionCard } from "@/components/ui/alpha-components";
import { getSuppliers, type Supplier } from "@/lib/services/suppliers";

export default function SupplierProfilePage() {
  const params = useParams<{ supplierId: string }>();

  const supplierId = params.supplierId;

  const {
    organization,
    branch,
    hasPermission,
    switchingContext,
    accessLoading,
  } = useAuth();

  const canViewFinance = hasPermission("finance.view");

  const [supplier, setSupplier] = useState<Supplier | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSupplier = useCallback(async () => {
    if (!supplierId || !organization?.id) {
      setSupplier(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setSupplier(null);

      const suppliers = await getSuppliers(organization.id);

      const currentSupplier =
        suppliers.find((item) => item.id === supplierId) ?? null;

      if (!currentSupplier) {
        throw new Error("Supplier was not found in the selected organisation.");
      }

      setSupplier(currentSupplier);
    } catch (loadError) {
      setSupplier(null);

      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load supplier."
      );
    } finally {
      setLoading(false);
    }
  }, [supplierId, organization?.id]);

  useEffect(() => {
    if (switchingContext || accessLoading) {
      setSupplier(null);
      return;
    }

    void loadSupplier();
  }, [loadSupplier, switchingContext, accessLoading]);

  const pageLoading = loading || switchingContext || accessLoading;

  if (pageLoading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center text-sm text-slate-500">
        Loading supplier...
      </div>
    );
  }

  if (error || !supplier) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error ?? "Supplier not found."}
        </div>

        <Link
          href="/suppliers"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-950"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Suppliers
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        href="/suppliers"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Suppliers
      </Link>

      <PageHeader
        title={supplier.name}
        description={`Supplier profile · ${supplier.supplier_code}`}
        actions={
          canViewFinance && branch?.id ? (
            <Link
              href={`/suppliers/${supplier.id}/statement`}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
            >
              <ReceiptText className="h-4 w-4" />
              View Statement
            </Link>
          ) : undefined
        }
      />

      <SectionCard
        title="Supplier Information"
        description="Contact and purchasing information for this supplier."
      >
        <div className="grid gap-6 p-5 md:grid-cols-2 xl:grid-cols-3">
          <div className="flex items-start gap-3">
            <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Supplier
              </p>

              <p className="mt-1 font-medium text-slate-900">{supplier.name}</p>

              <p className="mt-1 text-xs text-slate-500">
                {supplier.supplier_code}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Phone className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Contact
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {supplier.contact_name || "No contact name"}
              </p>

              <p className="mt-1 text-xs text-slate-500">
                {supplier.phone || "No phone number"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Email
              </p>

              <p className="mt-1 break-all font-medium text-slate-900">
                {supplier.email || "No email address"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Location
              </p>

              <p className="mt-1 font-medium text-slate-900">
                {[supplier.city, supplier.postcode]
                  .filter(Boolean)
                  .join(", ") || "No location recorded"}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Globe2 className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Website
              </p>

              <p className="mt-1 break-all font-medium text-slate-900">
                {supplier.website || "No website recorded"}
              </p>
            </div>
          </div>
        </div>

        {supplier.notes && (
          <div className="border-t px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Notes
            </p>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">
              {supplier.notes}
            </p>
          </div>
        )}
      </SectionCard>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/purchases"
          className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
        >
          <div className="flex items-center gap-3">
            <FileText className="h-5 w-5 text-slate-500" />

            <div>
              <p className="font-semibold text-slate-900">Purchase Orders</p>

              <p className="mt-1 text-sm text-slate-500">
                Review purchasing activity for this organisation.
              </p>
            </div>
          </div>
        </Link>

        {canViewFinance && branch?.id && (
          <Link
            href={`/suppliers/${supplier.id}/statement`}
            className="rounded-xl border bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow"
          >
            <div className="flex items-center gap-3">
              <ReceiptText className="h-5 w-5 text-slate-500" />

              <div>
                <p className="font-semibold text-slate-900">
                  Financial Statement
                </p>

                <p className="mt-1 text-sm text-slate-500">
                  View invoices and payments for the selected branch.
                </p>
              </div>
            </div>
          </Link>
        )}
      </div>
    </div>
  );
}
