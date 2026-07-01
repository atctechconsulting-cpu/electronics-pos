import {
  AlertTriangle,
  ArrowUpRight,
  Banknote,
  Package,
  ReceiptText,
  ShoppingCart,
  Users,
} from "lucide-react";

const stats = [
  {
    label: "Today's Sales",
    value: "£0.00",
    description: "No sales recorded today",
    icon: Banknote,
  },
  {
    label: "Orders",
    value: "0",
    description: "Orders processed today",
    icon: ShoppingCart,
  },
  {
    label: "Products",
    value: "0",
    description: "Products in catalogue",
    icon: Package,
  },
  {
    label: "Low Stock",
    value: "0",
    description: "Items below minimum stock",
    icon: AlertTriangle,
  },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Welcome to AlphaPOS. Monitor your sales, stock, and store activity.
          </p>
        </div>

        <button className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">
          Open POS
          <ArrowUpRight className="ml-2 h-4 w-4" />
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;

          return (
            <div
              key={stat.label}
              className="rounded-xl border bg-white p-5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">
                  {stat.label}
                </p>
                <div className="rounded-lg bg-slate-100 p-2">
                  <Icon className="h-4 w-4 text-slate-700" />
                </div>
              </div>

              <h2 className="mt-4 text-2xl font-bold text-slate-900">
                {stat.value}
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                {stat.description}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-900">Revenue Overview</h2>
              <p className="text-sm text-slate-500">
                Sales performance will appear here once transactions begin.
              </p>
            </div>
          </div>

          <div className="mt-6 flex h-72 items-center justify-center rounded-lg border border-dashed bg-slate-50">
            <p className="text-sm text-slate-400">Revenue chart coming soon</p>
          </div>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Recent Activity</h2>
          <p className="mt-1 text-sm text-slate-500">
            Latest sales, refunds, and stock updates.
          </p>

          <div className="mt-6 flex h-72 items-center justify-center rounded-lg border border-dashed bg-slate-50">
            <p className="text-sm text-slate-400">No activity yet</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <ReceiptText className="h-5 w-5 text-slate-700" />
          <h2 className="mt-4 font-semibold text-slate-900">
            Daily Closing
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Cash drawer and end-of-day summaries will be managed here.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <Package className="h-5 w-5 text-slate-700" />
          <h2 className="mt-4 font-semibold text-slate-900">
            Inventory Alerts
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Low stock, transfers, and purchase reminders will appear here.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <Users className="h-5 w-5 text-slate-700" />
          <h2 className="mt-4 font-semibold text-slate-900">
            Customer Insights
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Repeat customers, balances, and loyalty activity will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}