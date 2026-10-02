/* global globalThis */
const money = /^(0|[1-9]\d{0,9})\.\d{2}$/;
const validId = (value) => Number.isSafeInteger(value) && value > 0;
const storageKey = (customerId) => `mymeal:pending-order:v1:${customerId}`;

export function confirmedBody(source) {
  if (
    !source ||
    !validId(source.restaurant_id) ||
    !Array.isArray(source.items) ||
    source.items.length < 1 ||
    source.items.length > 100
  )
    throw new Error("Please refresh your cart.");
  const seen = new Set();
  const items = source.items
    .map((item) => {
      if (
        !validId(item.menu_id) ||
        seen.has(item.menu_id) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99 ||
        typeof item.quoted_price !== "string" ||
        !money.test(item.quoted_price)
      )
        throw new Error("Please refresh your cart.");
      seen.add(item.menu_id);
      return Object.freeze({
        menu_id: item.menu_id,
        quantity: item.quantity,
        quoted_price: item.quoted_price,
      });
    })
    .sort((a, b) => a.menu_id - b.menu_id);
  return Object.freeze({
    restaurant_id: source.restaurant_id,
    items: Object.freeze(items),
  });
}

export function newOrderKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (!globalThis.crypto?.getRandomValues)
    throw new Error("Unable to prepare this order in this browser.");
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Framework-independent state machine; persistence is scoped to the current user and tab.
export function createCheckoutFlow({
  customerId,
  storage,
  submit,
  keyFactory = newOrderKey,
}) {
  const slot = storageKey(customerId);
  const listeners = new Set();
  let pending = null;
  let state = { phase: "idle", order: null, quote: null, error: null };
  const read = () => {
    const text = storage.getItem(slot);
    if (!text) return null;
    const value = JSON.parse(text);
    if (
      value.version !== 1 ||
      value.customer_id !== customerId ||
      typeof value.key !== "string" ||
      !value.key.trim() ||
      value.key.length > 128
    )
      throw new Error("Invalid pending order record");
    return Object.freeze({ ...value, body: confirmedBody(value.body) });
  };
  const update = (next) => {
    state = { ...state, ...next };
    listeners.forEach((listener) => listener(getState()));
  };
  const getState = () => ({
    ...state,
    locked: ["submitting", "unknown", "blocked"].includes(state.phase),
  });
  try {
    pending = read();
    if (pending) state.phase = "unknown";
  } catch (error) {
    state.phase = "blocked";
    state.error =
      "Unable to restore your pending order. Check your order history before placing another order.";
  }
  const clear = (request) => {
    // A late response from an old component must not erase a newer operation.
    try {
      if (read()?.key === request.key) storage.removeItem(slot);
    } catch (_) {
      /* Safe replay remains possible. */
    }
    pending = null;
  };
  const attempt = async (request, previouslyUnknown) => {
    update({ phase: "submitting", error: null, quote: null, order: null });
    try {
      const order = await submit(request.body, request.key);
      if (!order?.id || !Array.isArray(order.items)) {
        update({
          phase: "unknown",
          error: "The order result could not be confirmed.",
        });
        return null;
      }
      clear(request);
      update({ phase: "success", order, quote: null, error: null });
      return order;
    } catch (error) {
      if (error.code === "IDEMPOTENCY_CONFLICT") {
        update({
          phase: "blocked",
          error:
            "This order confirmation conflicts with an existing request. Check your order history before continuing.",
        });
        return null;
      }
      // These business checks happen after the backend checked for an existing order.
      const provesNoOrder = [
        "PRICE_CHANGED",
        "CART_CHANGED",
        "CART_EMPTY",
        "MENU_UNAVAILABLE",
      ].includes(error.code);
      if (error.outcomeUnknown || (previouslyUnknown && !provesNoOrder)) {
        update({ phase: "unknown", error: error.message });
        return null;
      }
      clear(request);
      if (error.code === "PRICE_CHANGED") {
        try {
          confirmedBody(error.details);
          if (
            typeof error.details.total_price !== "string" ||
            !money.test(error.details.total_price)
          )
            throw new Error();
          update({ phase: "price_changed", quote: error.details, error: null });
        } catch (_) {
          update({
            phase: "error",
            quote: null,
            error:
              "Unable to read the updated prices. Please refresh your cart.",
          });
        }
      } else
        update({
          phase: "error",
          quote: null,
          error: error.message || "Unable to place the order.",
        });
      return null;
    }
  };
  const start = async (source) => {
    if (getState().locked) return null;
    try {
      const prior = read();
      if (prior) {
        pending = prior;
        update({ phase: "unknown", error: null });
        return null;
      }
      const request = Object.freeze({
        version: 1,
        customer_id: customerId,
        key: keyFactory(),
        body: confirmedBody(source),
      });
      // Persist before sending; do not submit if storage fails.
      storage.setItem(slot, JSON.stringify(request));
      pending = request;
      return await attempt(request, false);
    } catch (error) {
      update({
        phase: "error",
        error: error.message || "Unable to prepare your order.",
      });
      return null;
    }
  };
  return {
    getState,
    subscribe(listener) {
      listeners.add(listener);
      listener(getState());
      return () => listeners.delete(listener);
    },
    start,
    retry() {
      return state.phase === "unknown" && pending
        ? attempt(pending, true)
        : Promise.resolve(null);
    },
    confirmPrice() {
      return state.phase === "price_changed"
        ? start(state.quote)
        : Promise.resolve(null);
    },
    dismiss() {
      if (!getState().locked)
        update({ phase: "idle", order: null, quote: null, error: null });
    },
  };
}
