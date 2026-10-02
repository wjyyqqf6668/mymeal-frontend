export const AUTH_REQUIRED_EVENT = "mymeal:auth-required";

export class ApiError extends Error {
  constructor(message, { code = "NETWORK_ERROR", status = 0, details = null,
      outcomeUnknown = false, phase = "request" } = {}) {
    super(message);
    this.name = "ApiError";
    Object.assign(this, { code, status, details, outcomeUnknown, phase });
  }
}

let csrfToken = null;
let csrfPromise = null;
let csrfGeneration = 0;

export const invalidateCsrfToken = () => {
  csrfToken = null;
  csrfPromise = null;
  csrfGeneration += 1;
};

const notifyAuthRequired = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
};

// No automatic retries, especially for POST/PATCH/DELETE.
async function send(path, { method = "GET", body, headers = {}, signal,
    timeoutMs = 15000, notifyAuth = true } = {}) {
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (signal?.aborted) throw new ApiError("Request cancelled.", { code: "ABORTED" });
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  let timedOut = false;
  let started = false;
  const requestGeneration = csrfGeneration;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const requestHeaders = { Accept: "application/json", ...headers };
    let payload;
    if (body instanceof URLSearchParams) {
      requestHeaders["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      payload = body.toString();
    } else if (body !== undefined) {
      requestHeaders["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    started = true;
    const response = await fetch(path, { method, headers: requestHeaders, body: payload,
      credentials: "same-origin", redirect: "error", signal: controller.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch (error) {
      if (response.ok) throw new ApiError("The server returned an unreadable response.", {
        code: "PROTOCOL_ERROR", status: response.status, outcomeUnknown: mutation });
    }
    if (!response.ok) {
      const code = data?.code || "HTTP_ERROR";
      // A delayed failure from an older session must not clear a newer session/token.
      if (requestGeneration === csrfGeneration) {
        if (code === "CSRF_INVALID" || response.status === 401) invalidateCsrfToken();
        if (response.status === 401 && notifyAuth) notifyAuthRequired();
      }
      throw new ApiError(data?.message || `Request failed (${response.status}).`, {
        code, status: response.status, details: data?.details || null,
        outcomeUnknown: mutation && (response.status >= 500 || response.status === 408) });
    }
    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const code = timedOut ? "TIMEOUT" : controller.signal.aborted ? "ABORTED" : "NETWORK_ERROR";
    throw new ApiError(timedOut ? "The request timed out."
      : code === "ABORTED" ? "Request cancelled." : "Unable to reach the server.", {
      code, outcomeUnknown: mutation && started });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export async function getCsrfToken() {
  if (csrfToken) return csrfToken;
  if (csrfPromise) return csrfPromise;
  const generation = csrfGeneration;
  const promise = send("/auth/csrf", { notifyAuth: false }).then((data) => {
    if (!data || typeof data.header_name !== "string" || typeof data.token !== "string"
        || !data.header_name || !data.token) {
      throw new ApiError("Unable to verify this request.", { code: "PROTOCOL_ERROR", phase: "csrf" });
    }
    if (generation !== csrfGeneration) {
      throw new ApiError("The session changed. Please try again.", { code: "SESSION_CHANGED", phase: "csrf" });
    }
    csrfToken = data;
    return data;
  }).finally(() => { if (csrfPromise === promise) csrfPromise = null; });
  csrfPromise = promise;
  return promise;
}

export const refreshCsrfToken = () => { invalidateCsrfToken(); return getCsrfToken(); };

async function request(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  let headers = options.headers || {};
  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    let token;
    try { token = await getCsrfToken(); }
    catch (error) {
      // The intended write was never sent; a CSRF preflight failure is not an unknown order.
      throw new ApiError(error.message, { code: error.code, status: error.status,
        details: error.details, phase: "csrf", outcomeUnknown: false });
    }
    headers = { ...headers, [token.header_name]: token.token };
  }
  return send(path, { ...options, method, headers });
}

export async function login(credentials) {
  const form = new URLSearchParams({ username: credentials.username.trim().toLowerCase(),
    password: credentials.password });
  try { return await request("/login", { method: "POST", body: form, notifyAuth: false }); }
  finally { invalidateCsrfToken(); }
}

export async function logout() {
  try { return await request("/logout", { method: "POST", notifyAuth: false }); }
  finally { invalidateCsrfToken(); }
}

export const signup = (body) => request("/signup", { method: "POST", body, notifyAuth: false });
export async function getCurrentUser(options = {}) {
  const user = await request("/auth/me", { ...options, notifyAuth: false });
  if (!user?.id || !Array.isArray(user.roles)) {
    throw new ApiError("Unable to read your session.", { code: "PROTOCOL_ERROR" });
  }
  return user;
}

export const getRestaurants = (options = {}) => request("/restaurants", options);
export const getMenus = (restaurantId, options = {}) =>
  request(`/restaurant/${encodeURIComponent(restaurantId)}/menu`, options);
export const getCart = (options = {}) => request("/cart", options);
export const addItemToCart = (menuId, replaceCart = false) =>
  request("/cart/items", { method: "POST", body: { menu_id: menuId, replace_cart: replaceCart } });
export const updateCartItem = (itemId, quantity) => request(`/cart/items/${encodeURIComponent(itemId)}`, {
  method: "PATCH", body: { quantity } });
export const deleteCartItem = (itemId) => request(`/cart/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });

export async function checkout(body, idempotencyKey, options = {}) {
  if (!body || !Array.isArray(body.items) || !body.items.length
      || typeof idempotencyKey !== "string" || !idempotencyKey.trim() || idempotencyKey.length > 128) {
    throw new ApiError("Please confirm the order before submitting.", { code: "INVALID_REQUEST" });
  }
  const order = await request("/orders", { ...options, method: "POST", body,
    headers: { "Idempotency-Key": idempotencyKey } });
  if (!order?.id || !Array.isArray(order.items)) {
    throw new ApiError("The order result could not be confirmed.", {
      code: "PROTOCOL_ERROR", outcomeUnknown: true });
  }
  return order;
}

const listOrders = (path, { pageSize = 20, offset = 0, ...options } = {}) =>
  request(`${path}?${new URLSearchParams({ page_size: String(pageSize), offset: String(offset) })}`, options);
export const getOrders = (options) => listOrders("/orders", options);
export const getOrder = (id, options = {}) => request(`/orders/${encodeURIComponent(id)}`, options);
export const cancelOrder = (id) => request(`/orders/${encodeURIComponent(id)}/cancel`, { method: "POST" });
export const getMerchantOrders = (options) => listOrders("/merchant/orders", options);
export const getMerchantOrder = (id, options = {}) => request(`/merchant/orders/${encodeURIComponent(id)}`, options);
export const acceptOrder = (id) => request(`/merchant/orders/${encodeURIComponent(id)}/accept`, { method: "POST" });
export const completeOrder = (id) => request(`/merchant/orders/${encodeURIComponent(id)}/complete`, { method: "POST" });
