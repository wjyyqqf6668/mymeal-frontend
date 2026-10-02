const statuses = new Set(["PLACED", "ACCEPTED", "COMPLETED", "CANCELLED"]);
export const actionsFor = (status, merchant) => merchant
  ? status === "PLACED" ? ["accept"] : status === "ACCEPTED" ? ["complete"] : []
  : status === "PLACED" ? ["cancel"] : [];

export function checkedOrder(value, detail = false) {
  if (!Number.isSafeInteger(value?.id) || value.id < 1 || !statuses.has(value.status)
      || typeof value.total_price !== "string" || !/^\d+\.\d{2}$/.test(value.total_price)
      || typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at))
      || (detail && !Array.isArray(value.items))) throw new Error("Unable to read the order. Please refresh.");
  return value;
}

// Send a transition once. Always read the current state afterwards, including after 409/timeout.
// A GET observes the current state; it does not prove which request caused that state.
export async function transitionAndRead({ id, write, read }) {
  let notice = "Order updated.";
  let type = "success";
  try { checkedOrder(await write(id), true); }
  catch (error) {
    type = "warning";
    notice = error.code === "ORDER_STATE_CONFLICT"
      ? "This order changed before your action was applied. Review its current status."
      : error.outcomeUnknown
        ? "The action result was not confirmed. Review the current status before taking another action."
        : error.message || "Unable to update the order.";
  }
  try {
    const order = checkedOrder(await read(id), true);
    if (order.id !== id) throw new Error("The server returned a different order.");
    return { order, notice, type, error: null };
  } catch (error) {
    return { order: null, notice, type, error: error.message || "Unable to reload the order." };
  }
}
