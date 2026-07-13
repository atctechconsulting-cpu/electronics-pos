import { BasketItem } from "@/components/pos/basket-item";
import { usePos } from "@/components/pos/pos-provider";

export function Basket() {
  const {
    basket,
    itemCount,
    increaseQuantity,
    decreaseQuantity,
    removeProduct,
    clearBasket,
  } = usePos();

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Basket</h2>
          <p className="text-sm text-slate-500">{itemCount} item(s)</p>
        </div>

        {basket.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm("Clear the basket?")) {
                clearBasket();
              }
            }}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Clear Basket
          </button>
        )}
      </div>

      {basket.length === 0 ? (
        <div className="mt-4 flex h-72 items-center justify-center rounded-lg border-2 border-dashed text-slate-400">
          No items in basket
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {basket.map((item) => (
            <BasketItem
              key={item.id}
              item={item}
              onIncrease={increaseQuantity}
              onDecrease={decreaseQuantity}
              onRemove={removeProduct}
            />
          ))}
        </div>
      )}
    </div>
  );
}
