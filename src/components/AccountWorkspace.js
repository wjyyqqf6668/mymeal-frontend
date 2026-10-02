import { Radio } from "antd";
import { useState } from "react";
import OrderingWorkspace from "./OrderingWorkspace";
import OrdersPage from "./OrdersPage";

export default function AccountWorkspace({ user }) {
  const [view, setView] = useState("menu");
  const merchant = user.roles.includes("ROLE_MERCHANT");
  return <>
    <Radio.Group value={view} onChange={(event) => setView(event.target.value)} style={{ marginBottom: 24 }}>
      <Radio.Button value="menu">Order food</Radio.Button>
      <Radio.Button value="orders">My orders</Radio.Button>
      {merchant && <Radio.Button value="merchant">Restaurant orders</Radio.Button>}
    </Radio.Group>
    {/* Keep checkout state mounted when opening history, including uncertain requests. */}
    <div hidden={view !== "menu"}>
      <OrderingWorkspace customerId={user.id} active={view === "menu"} />
    </div>
    {view === "orders" && <OrdersPage key="customer" />}
    {view === "merchant" && merchant && <OrdersPage key="merchant" merchant />}
  </>;
}
