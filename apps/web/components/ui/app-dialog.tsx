"use client";

import { X } from "lucide-react";
import type { ReactNode } from "react";

type AppDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl";
  closeDisabled?: boolean;
};

const widthClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
};

export function AppDialog({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  maxWidth = "2xl",
  closeDisabled = false,
}: AppDialogProps) {
  if (!open) {
    return null;
  }

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !closeDisabled) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6"
      onMouseDown={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-dialog-title"
        aria-describedby={description ? "app-dialog-description" : undefined}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ${widthClasses[maxWidth]}`}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2
              id="app-dialog-title"
              className="text-xl font-semibold text-slate-900"
            >
              {title}
            </h2>

            {description && (
              <p
                id="app-dialog-description"
                className="mt-1 text-sm leading-6 text-slate-500"
              >
                {description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            className="shrink-0 rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Close ${title}`}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
          {children}
        </div>

        {footer && (
          <div className="shrink-0 border-t bg-white px-5 py-4 sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

type AppDialogFooterProps = {
  children: ReactNode;
};

export function AppDialogFooter({ children }: AppDialogFooterProps) {
  return (
    <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
      {children}
    </div>
  );
}

type AppDialogCancelButtonProps = {
  children?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
};

export function AppDialogCancelButton({
  children = "Cancel",
  onClick,
  disabled = false,
}: AppDialogCancelButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

type AppDialogActionButtonProps = {
  children: ReactNode;
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "danger";
};

export function AppDialogActionButton({
  children,
  type = "button",
  onClick,
  disabled = false,
  variant = "primary",
}: AppDialogActionButtonProps) {
  const variantClass =
    variant === "danger"
      ? "bg-red-600 hover:bg-red-700"
      : "bg-slate-900 hover:bg-slate-800";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg px-4 py-2.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${variantClass}`}
    >
      {children}
    </button>
  );
}
