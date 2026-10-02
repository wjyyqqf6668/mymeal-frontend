import { Alert, Button, Card, Empty, List, Modal, Select, Space, Typography, message } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { useEffect, useState } from "react";
import { getMenus, getRestaurants } from "../utils";

export default function FoodList({ active = true, disabled = false, onAdd }) {
  const [restaurants, setRestaurants] = useState([]);
  const [restaurantId, setRestaurantId] = useState(null);
  const [restaurantsLoading, setRestaurantsLoading] = useState(true);
  const [restaurantsError, setRestaurantsError] = useState(null);
  const [retry, setRetry] = useState(0);
  const [menu, setMenu] = useState({ items: [], loading: false, error: null });
  const [menuRetry, setMenuRetry] = useState(0);
  const [replacement, setReplacement] = useState(null);

  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setRestaurantsLoading(true); setRestaurantsError(null);
    getRestaurants({ signal: controller.signal }).then((data) => {
      if (!Array.isArray(data)) throw new Error("Unable to read the restaurant list.");
      if (active) setRestaurants(data);
    }).catch((error) => { if (active && error.code !== "ABORTED") setRestaurantsError(error.message); })
      .finally(() => { if (active) setRestaurantsLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [retry]);

  useEffect(() => {
    if (!restaurantId) return undefined;
    const controller = new AbortController(); let active = true;
    setMenu({ items: [], loading: true, error: null });
    getMenus(restaurantId, { signal: controller.signal }).then((items) => {
      if (!Array.isArray(items)) throw new Error("Unable to read this menu.");
      if (active) setMenu({ items, loading: false, error: null });
    }).catch((error) => {
      if (active && error.code !== "ABORTED") setMenu({ items: [], loading: false, error: error.message });
    });
    return () => { active = false; controller.abort(); };
  }, [restaurantId, menuRetry]);

  const add = async (item, replace = false) => {
    try {
      await onAdd(item.id, replace);
      setReplacement(null); message.success("Added to cart.");
    } catch (error) {
      if (error.code === "RESTAURANT_CONFLICT" && !replace) setReplacement(item);
      else message.error(error.outcomeUnknown ? "The update was not confirmed. Check your cart before adding again." : error.message);
    }
  };

  return <>
    {restaurantsError && <Alert type="error" message={restaurantsError} showIcon style={{ marginBottom: 16 }}
      action={<Button onClick={() => setRetry((n) => n + 1)}>Retry</Button>} />}
    <Select value={restaurantId || undefined} placeholder="Select a restaurant"
      loading={restaurantsLoading} style={{ width: "100%", maxWidth: 360 }}
      options={restaurants.map((item) => ({ value: item.id, label: item.name }))}
      onChange={(id) => { setMenu({ items: [], loading: true, error: null }); setRestaurantId(id); }} />
    {!restaurantsLoading && !restaurantsError && !restaurants.length && <Empty description="No restaurants available" />}
    {menu.error && <Alert type="error" message={menu.error} showIcon style={{ marginTop: 20 }}
      action={<Button onClick={() => setMenuRetry((n) => n + 1)}>Retry</Button>} />}
    {restaurantId && !menu.error && <List style={{ marginTop: 20 }} loading={menu.loading}
      rowKey="id" grid={{ gutter: 16, xs: 1, sm: 2, md: 3, lg: 3, xl: 4, xxl: 4 }}
      dataSource={menu.items} locale={{ emptyText: "No menu items available" }}
      renderItem={(item) => <List.Item><Card title={item.name}>
        {item.image_url && <img src={item.image_url} alt={item.name} style={{ width: "100%", height: 160, objectFit: "cover" }} />}
        <Space style={{ marginTop: 12, width: "100%", justifyContent: "space-between" }}>
          <Typography.Text>${item.price}</Typography.Text>
          <Button type="primary" icon={<PlusOutlined />} disabled={disabled || !item.available || menu.loading}
            onClick={() => add(item)}>{item.available ? "Add" : "Unavailable"}</Button>
        </Space>
      </Card></List.Item>} />}
    <Modal title="Replace your current cart?" open={active && !!replacement} okText="Replace and add"
      okButtonProps={{ disabled }} onCancel={() => setReplacement(null)}
      onOk={() => replacement && add(replacement, true)}>
      Your cart contains items from another restaurant. Replace them with {replacement?.name}?
    </Modal>
  </>;
}
