import type { ReactNode } from "react";

export const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100";
export const buttonClass = "rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50";
export const secondaryClass = "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium disabled:opacity-50";
export function RepairField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium text-slate-700"><span>{label}</span>{children}</label>;
}
export function RepairError({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p> : null;
}
export function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }) : "—";
}
export function localDateTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
