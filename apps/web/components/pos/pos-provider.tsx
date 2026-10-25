"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";

import type { Customer } from "@/lib/services/customers";

import { IdentifierSelector } from "@/components/pos/identifier-selector";
import { addBasketProduct, decreaseBasketProduct, isTracked, type PosBasketItem, type PosProduct } from "@/lib/pos-basket";
export type { PosBasketItem } from "@/lib/pos-basket";

type PosContextValue = {
  basket: PosBasketItem[];
  itemCount: number;
  subtotal: number;
  vat: number;
  total: number;

  selectedCustomer: Customer | null;
  setSelectedCustomer: (customer: Customer | null) => void;

  addProduct: (product: PosProduct) => void;
  increaseQuantity: (id: string) => void;
  decreaseQuantity: (id: string) => void;
  removeIdentifier: (id: string, identifierId: string) => void;
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

  const [selectingProduct, setSelectingProduct] = useState<PosProduct | null>(null);

  function addProduct(product: PosProduct) {
    if (isTracked(product)) { setSelectingProduct(product); return; }
    setBasket(current => {
      if ((current.find(item => item.id === product.id)?.quantity ?? 0) >= product.quantity_available) return current;
      return addBasketProduct(current, product);
    });
  }

  function increaseQuantity(id: string) {
    const product = basket.find(item => item.id === id);
    if (product) addProduct(product);
  }

  function decreaseQuantity(id: string) {
    setBasket(current => decreaseBasketProduct(current, id));
  }

  function removeIdentifier(id: string, identifierId: string) {
    setBasket(current => decreaseBasketProduct(current, id, identifierId));
  }

  function removeProduct(id: string) {
    setBasket((current) => current.filter((item) => item.id !== id));
  }

  function clearBasket() {
    setBasket([]);
    setSelectingProduct(null);
  }

  function resetSale() {
    setBasket([]);
    setSelectingProduct(null);
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
        removeIdentifier,
        clearBasket,
        resetSale,
      }}
    >
      {children}
      {selectingProduct && <IdentifierSelector
        key={selectingProduct.id}
        product={selectingProduct}
        excludedIds={basket.flatMap(item => item.identifiers.map(row => row.id))}
        remainingQuantity={Math.max(0, selectingProduct.quantity_available - (basket.find(item => item.id === selectingProduct.id)?.quantity ?? 0))}
        onClose={() => setSelectingProduct(null)}
        onConfirm={rows => {
          setBasket(addBasketProduct(basket, selectingProduct, rows));
          setSelectingProduct(null);
        }}
      />}
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
