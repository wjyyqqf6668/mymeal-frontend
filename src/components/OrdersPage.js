import { Alert, Button, Drawer, Empty, List, Modal, Space, Spin, Table, Tag, Typography } from "antd";
import { useCallback, useEffect, useRef, useState } from "react";
import { getOrders, getOrder, getMerchantOrders, getMerchantOrder, cancelOrder, acceptOrder, completeOrder } from "../utils";
import { actionsFor, checkedOrder, transitionAndRead } from "../orders/orderActions";

const PAGE_SIZE = 20;
const labels = { cancel: "Cancel order", accept: "Accept order", complete: "Complete order" };
const colors = { PLACED: "blue", ACCEPTED: "orange", COMPLETED: "green", CANCELLED: "default" };
const writes = { cancel: cancelOrder, accept: acceptOrder, complete: completeOrder };
const statusTag = (status) => <Tag color={colors[status]}>{status}</Tag>;
const dateText = (value) => new Date(value).toLocaleString();

export default function OrdersPage({ merchant = false }) {
  const listApi = merchant ? getMerchantOrders : getOrders;
  const detailApi = merchant ? getMerchantOrder : getOrder;
  const [page, setPage] = useState({ rows: [], offset: 0, loading: true, error: null });
  const [detail, setDetail] = useState({ id: null, order: null, loading: false, error: null });
  const [notice, setNotice] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const gate = useRef(false);
  const life = useRef(0);
  const listSequence = useRef(0);
  const detailSequence = useRef(0);
  const listAbort = useRef(null);
  const detailAbort = useRef(null);

  const loadList = useCallback(async (offset) => {
    const seq = ++listSequence.current;
    listAbort.current?.abort();
    const controller = new AbortController(); listAbort.current = controller;
    setPage({ rows: [], offset, loading: true, error: null });
    try {
      const rows = await listApi({ pageSize: PAGE_SIZE, offset, signal: controller.signal });
      if (!Array.isArray(rows)) throw new Error("Unable to read orders.");
      rows.forEach((row) => checkedOrder(row));
      if (seq === listSequence.current) setPage({ rows, offset, loading: false, error: null });
    } catch (error) {
      if (seq === listSequence.current) setPage({ rows: [], offset, loading: false, error: error.message });
    }
  }, [listApi]);

  const loadDetail = async (id) => {
    if (gate.current) return;
    const seq = ++detailSequence.current;
    detailAbort.current?.abort();
    const controller = new AbortController(); detailAbort.current = controller;
    setNotice(null); setConfirmation(null);
    setDetail({ id, order: null, loading: true, error: null });
    try {
      const order = checkedOrder(await detailApi(id, { signal: controller.signal }), true);
      if (order.id !== id) throw new Error("The server returned a different order.");
      if (seq === detailSequence.current) setDetail({ id, order, loading: false, error: null });
    } catch (error) {
      if (seq === detailSequence.current) setDetail({ id, order: null, loading: false, error: error.message });
    }
  };

  useEffect(() => {
    life.current += 1;
    loadList(0);
    return () => {
      life.current += 1; listSequence.current += 1; detailSequence.current += 1;
      listAbort.current?.abort(); detailAbort.current?.abort();
    };
  }, [loadList]);

  const closeDetail = () => {
    if (gate.current) return;
    detailSequence.current += 1; detailAbort.current?.abort();
    setDetail({ id: null, order: null, loading: false, error: null }); setConfirmation(null); setNotice(null);
  };

  const perform = async () => {
    const action = confirmation;
    if (gate.current || !detail.order || !actionsFor(detail.order.status, merchant).includes(action)) return;
    gate.current = true; setBusy(true); setConfirmation(null);
    const generation = life.current;
    const id = detail.id;
    detailSequence.current += 1; detailAbort.current?.abort();
    setDetail({ id, order: null, loading: true, error: null }); setNotice(null);
    const result = await transitionAndRead({ id, write: writes[action], read: detailApi });
    // Requests can finish after logout or after switching pages. Never update a later view.
    if (generation !== life.current) return;
    setDetail({ id, order: result.order, loading: false, error: result.error });
    setNotice({ type: result.type, text: result.notice });
    await loadList(page.offset);
    if (generation === life.current) { gate.current = false; setBusy(false); }
  };

  const columns = [
    { title: "Order", dataIndex: "id", render: (id) => `#${id}` },
    { title: "Restaurant", dataIndex: "restaurant_id", render: (id) => `#${id}` },
    { title: "Status", dataIndex: "status", render: statusTag },
    { title: "Total", dataIndex: "total_price", render: (value) => `$${value}` },
    { title: "Created (local time)", dataIndex: "created_at", render: dateText },
    { title: "", key: "detail", render: (_, row) => <Button disabled={busy} onClick={() => loadDetail(row.id)}>Details</Button> },
  ];
  return <>
    <Space wrap style={{ marginBottom: 16 }}>
      <Typography.Title level={3} style={{ margin: 0 }}>{merchant ? "Restaurant orders" : "My orders"}</Typography.Title>
      <Button disabled={busy || page.loading} onClick={() => loadList(0)}>Refresh latest</Button>
    </Space>
    {page.error && <Alert type="error" showIcon message={page.error} style={{ marginBottom: 16 }}
      action={<Button disabled={busy || page.loading} onClick={() => loadList(page.offset)}>Retry</Button>} />}
    <Table rowKey="id" dataSource={page.rows} columns={columns} loading={page.loading}
      pagination={false} scroll={{ x: 700 }} locale={{ emptyText: <Empty description="No orders on this page" /> }} />
    <Space style={{ marginTop: 16 }}>
      <Button disabled={busy || page.loading || page.offset === 0} onClick={() => loadList(Math.max(0, page.offset - PAGE_SIZE))}>Previous</Button>
      <span>Page {Math.floor(page.offset / PAGE_SIZE) + 1}</span>
      <Button disabled={busy || page.loading || !!page.error || page.rows.length < PAGE_SIZE}
        onClick={() => loadList(page.offset + PAGE_SIZE)}>Next</Button>
    </Space>
    <Drawer title={detail.id ? `Order #${detail.id}` : "Order details"} open={detail.id !== null}
      width="min(600px, 100vw)" onClose={closeDetail} closable={!busy} maskClosable={!busy} keyboard={!busy}>
      {notice && <Alert type={notice.type} showIcon message={notice.text} style={{ marginBottom: 16 }} />}
      {detail.loading && <Spin />}
      {detail.error && <Alert type="error" showIcon message={detail.error}
        description="Actions are disabled until the current order can be loaded."
        action={<Button disabled={busy} onClick={() => loadDetail(detail.id)}>Reload</Button>} />}
      {detail.order && <>
        <p>{statusTag(detail.order.status)} Restaurant #{detail.order.restaurant_id}</p>
        <p>{dateText(detail.order.created_at)}</p>
        <List dataSource={detail.order.items} rowKey="id" renderItem={(item) => <List.Item>
          <div><Typography.Text strong>{item.name}</Typography.Text>
            <div>{item.quantity} × ${item.unit_price} = ${item.line_total}</div></div>
        </List.Item>} />
        <p><Typography.Text strong>Total: ${detail.order.total_price}</Typography.Text></p>
        <Space wrap>
          <Button disabled={busy} onClick={() => loadDetail(detail.id)}>Refresh status</Button>
          {actionsFor(detail.order.status, merchant).map((action) => <Button key={action} disabled={busy}
            danger={action === "cancel"} type="primary" onClick={() => setConfirmation(action)}>{labels[action]}</Button>)}
        </Space>
      </>}
    </Drawer>
    <Modal title={labels[confirmation] || "Confirm action"} open={!!confirmation}
      okText="Confirm" onOk={perform} onCancel={() => setConfirmation(null)} confirmLoading={busy}>
      <p>{confirmation === "cancel" ? "Cancel this order? This cannot be undone."
        : confirmation === "accept" ? "Accept this order? The customer will no longer be able to cancel it."
          : "Mark this order as completed?"}</p>
    </Modal>
  </>;
}
