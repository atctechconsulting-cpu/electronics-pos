"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

import type { Customer } from "@/lib/services/customers";

export type PosBasketItem = {
  id: string;
  name: string;
  sku: string;
  retail_price: number;
  quantity_available: number;
  quantity: number;
};

type AddProductInput = Omit<PosBasketItem, "quantity">;

type PosContextValue = {
  basket: PosBasketItem[];
  itemCount: number;
  subtotal: number;
  vat: number;
  total: number;

  selectedCustomer: Customer | null;
  setSelectedCustomer: (customer: Customer | null) => void;

  addProduct: (product: AddProductInput) => void;
  increaseQuantity: (id: string) => void;
  decreaseQuantity: (id: string) => void;
  removeProduct: (id: string) => void;
  clearBasket: () => void;
  resetSale: () => void;
};

const PosContext = createContext<PosContextValue | undefined>(undefined);

export function PosProvider({ children }: { children: ReactNode }) {
  const [basket, setBasket] = useState<PosBasketItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );

  function addProduct(product: AddProductInput) {
    setBasket((current) => {
      const existing = current.find((item) => item.id === product.id);

      if (existing) {
        if (existing.quantity >= existing.quantity_available) {
          return current;
        }

        return current.map((item) =>
          item.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }

      return [
        ...current,
        {
          ...product,
          retail_price: Number(product.retail_price),
          quantity_available: Number(product.quantity_available),
          quantity: 1,
        },
      ];
    });
  }

  function increaseQuantity(id: string) {
    setBasket((current) =>
      current.map((item) =>
        item.id === id && item.quantity < item.quantity_available
          ? { ...item, quantity: item.quantity + 1 }
          : item
      )
    );
  }

  function decreaseQuantity(id: string) {
    setBasket((current) =>
      current
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function removeProduct(id: string) {
    setBasket((current) => current.filter((item) => item.id !== id));
  }

  function clearBasket() {
    setBasket([]);
  }

  function resetSale() {
    setBasket([]);
    setSelectedCustomer(null);
  }

  const totals = useMemo(() => {
    const total = basket.reduce(
      (sum, item) => sum + item.retail_price * item.quantity,
      0
    );

    const vat = total - total / 1.2;
    const subtotal = total - vat;

    return {
      itemCount: basket.reduce((sum, item) => sum + item.quantity, 0),
      subtotal,
      vat,
      total,
    };
  }, [basket]);

  return (
    <PosContext.Provider
      value={{
        basket,
        itemCount: totals.itemCount,
        subtotal: totals.subtotal,
        vat: totals.vat,
        total: totals.total,

        selectedCustomer,
        setSelectedCustomer,

        addProduct,
        increaseQuantity,
        decreaseQuantity,
        removeProduct,
        clearBasket,
        resetSale,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePos() {
  const context = useContext(PosContext);

  if (!context) {
    throw new Error("usePos must be used inside PosProvider");
  }

  return context;
}
