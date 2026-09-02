import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
          {title}
        </h1>

        {description && (
          <p className="mt-1 text-sm text-slate-500">{description}</p>
        )}
      </div>

      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          {actions}
        </div>
      )}
    </div>
  );
}

type SectionCardProps = {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  contentClassName?: string;
};

export function SectionCard({
  children,
  title,
  description,
  actions,
  className = "",
  contentClassName = "",
}: SectionCardProps) {
  const hasHeader = title || description || actions;

  return (
    <section
      className={`overflow-hidden rounded-xl border bg-white shadow-sm ${className}`}
    >
      {hasHeader && (
        <div className="flex flex-col justify-between gap-3 border-b px-5 py-4 sm:flex-row sm:items-start">
          <div>
            {title && <h2 className="font-semibold text-slate-900">{title}</h2>}

            {description && (
              <p className="mt-1 text-sm text-slate-500">{description}</p>
            )}
          </div>

          {actions && (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}

      <div className={contentClassName}>{children}</div>
    </section>
  );
}

type StatCardProps = {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  description?: string;
};

export function StatCard({
  label,
  value,
  icon: Icon,
  description,
}: StatCardProps) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>

          <div className="mt-3 text-2xl font-bold text-slate-900">{value}</div>

          {description && (
            <p className="mt-2 text-xs text-slate-500">{description}</p>
          )}
        </div>

        <div className="shrink-0 rounded-lg bg-slate-100 p-2.5">
          <Icon className="h-5 w-5 text-slate-700" />
        </div>
      </div>
    </div>
  );
}

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="px-6 py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>

      <h3 className="mt-4 text-lg font-semibold text-slate-900">{title}</h3>

      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
        {description}
      </p>

      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

type StatusBadgeProps = {
  status: string;
};

const statusClasses: Record<string, string> = {
  COMPLETED: "bg-green-50 text-green-700 ring-green-600/20",
  ACTIVE: "bg-green-50 text-green-700 ring-green-600/20",
  IN_STOCK: "bg-green-50 text-green-700 ring-green-600/20",
  PAID: "bg-green-50 text-green-700 ring-green-600/20",

  PENDING: "bg-amber-50 text-amber-700 ring-amber-600/20",
  DRAFT: "bg-amber-50 text-amber-700 ring-amber-600/20",
  HELD: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PARTIALLY_PAID: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PARTIALLY_RECEIVED: "bg-amber-50 text-amber-700 ring-amber-600/20",

  SOLD: "bg-blue-50 text-blue-700 ring-blue-600/20",
  PROCESSING: "bg-blue-50 text-blue-700 ring-blue-600/20",
  ORDERED: "bg-blue-50 text-blue-700 ring-blue-600/20",

  REFUNDED: "bg-purple-50 text-purple-700 ring-purple-600/20",
  RETURNED: "bg-purple-50 text-purple-700 ring-purple-600/20",

  UNPAID: "bg-red-50 text-red-700 ring-red-600/20",
  CANCELLED: "bg-red-50 text-red-700 ring-red-600/20",

  INACTIVE: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const normalizedStatus = status.trim().toUpperCase().replaceAll(" ", "_");

  const className =
    statusClasses[normalizedStatus] ??
    "bg-slate-100 text-slate-700 ring-slate-500/20";

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {normalizedStatus.replaceAll("_", " ")}
    </span>
  );
}

type CurrencyProps = {
  amount: number;
  className?: string;
};

export function Currency({ amount, className = "" }: CurrencyProps) {
  return (
    <span className={className}>
      £
      {Number(amount).toLocaleString("en-GB", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </span>
  );
}
