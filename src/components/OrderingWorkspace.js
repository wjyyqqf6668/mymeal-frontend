import { Alert, Button, Space } from "antd";
import { useRef, useState } from "react";
import { addItemToCart, updateCartItem, deleteCartItem } from "../utils";
import useCart from "../hooks/useCart";
import useCheckout from "../hooks/useCheckout";
import FoodList from "./FoodList";
import MyCart from "./MyCart";

// App keys this workspace by account ID. Drawer close does not unmount checkout state.
export default function OrderingWorkspace({ customerId, active = true }) {
  const cart = useCart();
  const order = useCheckout(customerId);
  const [busy, setBusy] = useState(false);
  const gate = useRef(false);
  const guarded = async (action) => {
    if (gate.current) throw new Error("Please wait for the current operation.");
    gate.current = true; setBusy(true);
    try { return await action(); }
    finally { gate.current = false; setBusy(false); }
  };
  const mutate = (action) => guarded(() => {
    if (order.flow.getState().locked) throw new Error("Confirm the pending order before changing the cart.");
    return cart.mutate(action);
  });
  const runCheckout = (action) => guarded(async () => {
    const result = await action();
    // The state machine owns success/conflict information even if this read fails.
    if (!order.flow.getState().locked) await cart.reload();
    return result;
  });
  const disabled = busy || cart.loading || order.locked;
  return <>
    <Space style={{ marginBottom: 20 }}>
      <MyCart active={active} cart={cart} order={order} busy={busy}
        onUpdate={(id, quantity) => mutate(() => updateCartItem(id, quantity))}
        onDelete={(id) => mutate(() => deleteCartItem(id))}
        onSubmit={() => runCheckout(() => order.flow.start(cart.data))}
        onRetry={() => runCheckout(() => order.flow.retry())}
        onConfirmPrice={() => runCheckout(() => order.flow.confirmPrice())} />
      <Button disabled={busy || order.phase === "submitting"} onClick={cart.reload}>Refresh cart</Button>
    </Space>
    {order.locked && <Alert type="warning" showIcon style={{ marginBottom: 20 }}
      message={order.phase === "submitting" ? "Submitting your order…" : "A previous order needs confirmation. Open your cart to check its result."} />}
    <FoodList active={active} disabled={disabled} onAdd={(id, replace) => mutate(() => addItemToCart(id, replace))} />
  </>;
}
