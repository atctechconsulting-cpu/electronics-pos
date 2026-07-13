import type { PosBasketItem } from "@/components/pos/pos-provider";
import { Minus, Plus, Trash2 } from "lucide-react";

type Props = {
  item: PosBasketItem;
  onIncrease: (id: string) => void;
  onDecrease: (id: string) => void;
  onRemove: (id: string) => void;
};

export function BasketItem({ item, onIncrease, onDecrease, onRemove }: Props) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-medium">{item.name}</h3>

          <p className="text-xs text-slate-500">{item.sku}</p>

          <p className="mt-1 text-sm font-semibold">
            £{item.retail_price.toFixed(2)} each
          </p>
        </div>

        <button
          onClick={() => onRemove(item.id)}
          className="text-red-500 hover:text-red-700"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onDecrease(item.id)}
            className="rounded border p-2"
          >
            <Minus size={16} />
          </button>

          <span className="w-8 text-center font-medium">{item.quantity}</span>

          <button
            disabled={item.quantity >= item.quantity_available}
            onClick={() => onIncrease(item.id)}
            className="rounded border p-2 disabled:opacity-40"
          >
            <Plus size={16} />
          </button>
        </div>

        <strong>£{(item.quantity * item.retail_price).toFixed(2)}</strong>
      </div>
    </div>
  );
}
