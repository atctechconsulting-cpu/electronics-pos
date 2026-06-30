import { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";

export default function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-slate-100 lg:flex">
      <AppSidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <AppHeader />

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}