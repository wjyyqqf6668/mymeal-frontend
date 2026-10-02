import { Alert, Button, Drawer, Empty, InputNumber, List, Modal, Space, Spin, Typography, message } from "antd";
import { useState } from "react";

export default function MyCart({ active = true, cart, order, busy, onUpdate, onDelete, onSubmit, onRetry, onConfirmPrice }) {
  const [open, setOpen] = useState(false);
  const locked = busy || cart.loading || order.locked;
  const run = async (action) => {
    try { await action(); }
    catch (error) { message.error(error.outcomeUnknown ? "The update was not confirmed. Refresh your cart before trying again." : error.message); }
  };
  const canSubmit = !!cart.data?.items?.length && !cart.error && !locked
    && cart.data.items.every((item) => item.available);
  return <>
    <Button type="primary" onClick={() => setOpen(true)}>My cart</Button>
    <Drawer title="My cart" open={active && open} width="min(560px, 100vw)" onClose={() => setOpen(false)}
      footer={<Space style={{ display: "flex", justifyContent: "space-between" }}>
        <Typography.Text strong>Total: {cart.data ? `$${cart.data.total_price}` : "—"}</Typography.Text>
        <Button type="primary" disabled={!canSubmit} onClick={() => run(onSubmit)}>Place order</Button>
      </Space>}>
      {order.phase === "success" && <Alert type="success" showIcon style={{ marginBottom: 16 }}
        message={`Order #${order.order.id} confirmed`} description={`Status: ${order.order.status}. Total: $${order.order.total_price}.`}
        action={<Button onClick={order.flow.dismiss}>Dismiss</Button>} />}
      {order.phase === "unknown" && <Alert type="warning" showIcon style={{ marginBottom: 16 }}
        message="Order result not confirmed" description="Check the original order before changing your cart or placing another order."
        action={<Button disabled={busy} onClick={() => run(onRetry)}>Check order result</Button>} />}
      {order.phase === "submitting" && <Alert type="info" showIcon message="Submitting your order…" style={{ marginBottom: 16 }} />}
      {order.error && order.phase !== "submitting" && <Alert type="error" showIcon message={order.error} style={{ marginBottom: 16 }} />}
      {cart.error && <Alert type="error" message={cart.error} showIcon style={{ marginBottom: 16 }}
        action={<Button disabled={busy || order.phase === "submitting"} onClick={cart.reload}>Retry loading</Button>} />}
      {cart.loading && <Spin />}
      {!cart.loading && cart.data && !cart.data.items.length && <Empty description="Your cart is empty" />}
      {cart.data && <List dataSource={cart.data.items} rowKey="id" renderItem={(item) => <List.Item>
        <div style={{ width: "100%" }}>
          <Typography.Text strong>{item.name}</Typography.Text>
          <div>${item.quoted_price} each · Subtotal ${item.line_total}</div>
          {!item.available && <Typography.Text type="danger">Unavailable. Remove this item before ordering.</Typography.Text>}
          {item.current_price !== item.quoted_price && <div><Typography.Text type="warning">Current menu price: ${item.current_price}. You will be asked to confirm any price change.</Typography.Text></div>}
          <Space style={{ marginTop: 8 }}>
            <InputNumber min={1} max={99} precision={0} value={item.quantity} disabled={locked}
              aria-label={`Quantity for ${item.name}`} onChange={(value) => {
                if (Number.isInteger(value) && value !== item.quantity) run(() => onUpdate(item.id, value));
              }} />
            <Button danger disabled={locked} onClick={() => run(() => onDelete(item.id))}>Remove</Button>
          </Space>
        </div>
      </List.Item>} />}
    </Drawer>
    <Modal title="Confirm updated prices" open={active && order.phase === "price_changed"}
      okText="Confirm and place order" okButtonProps={{ disabled: busy }}
      onCancel={order.flow.dismiss} onOk={() => run(onConfirmPrice)}>
      <p>Prices changed since you reviewed your cart. Confirm these prices to place the order.</p>
      <List dataSource={order.quote?.items || []} rowKey="menu_id" renderItem={(item) => <List.Item>
        {item.name} × {item.quantity} — ${item.quoted_price} each
      </List.Item>} />
      <Typography.Text strong>New total: ${order.quote?.total_price}</Typography.Text>
    </Modal>
  </>;
}
