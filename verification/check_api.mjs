import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/utils.js", import.meta.url), "utf8");
const api = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
let calls = [];
let handler;
globalThis.fetch = async (path, options) => { calls.push({ path, options }); return handler(path, options); };
const token = { header_name: "X-CSRF-TOKEN", token: "masked-test-token" };
const body = { restaurant_id: 1, items: [{ menu_id: 2, quantity: 1, quoted_price: "12.50" }] };

handler = async (path) => path === "/auth/csrf" ? json(token) : new Response(null, { status: 200 });
await api.login({ username: "USER@EXAMPLE.COM", password: "a&b#c+d" });
assert.equal(calls[1].path, "/login");
assert.equal(new URLSearchParams(calls[1].options.body).get("password"), "a&b#c+d");
assert.equal(new URLSearchParams(calls[1].options.body).get("username"), "user@example.com");
assert.equal(calls[1].options.headers[token.header_name], token.token);
assert.equal(calls[1].options.credentials, "same-origin");
await api.getCsrfToken();
assert.equal(calls.filter((c) => c.path === "/auth/csrf").length, 2, "Login invalidates old CSRF");

calls = []; api.invalidateCsrfToken();
handler = async () => json(token);
await Promise.all([api.getCsrfToken(), api.getCsrfToken()]);
assert.equal(calls.length, 1, "Concurrent token fetches are coalesced");

calls = [];
handler = async () => json({ code: "PRICE_CHANGED", message: "Confirm price", details: { total_price: "13.00" } }, 409);
await assert.rejects(api.checkout(body, "request-1"), (e) => e.code === "PRICE_CHANGED" && !e.outcomeUnknown && e.details.total_price === "13.00");
assert.equal(calls.length, 1);
assert.equal(calls[0].options.headers["Idempotency-Key"], "request-1");
assert.deepEqual(JSON.parse(calls[0].options.body), body);

calls = [];
handler = async () => { throw new TypeError("simulated network loss"); };
await assert.rejects(api.checkout(body, "request-1"), (e) => e.outcomeUnknown && e.code === "NETWORK_ERROR");
assert.equal(calls.length, 1, "No automatic write retry");

calls = []; api.invalidateCsrfToken();
await assert.rejects(api.checkout(body, "request-1"), (e) => !e.outcomeUnknown && e.phase === "csrf");
assert.deepEqual(calls.map((c) => c.path), ["/auth/csrf"]);

handler = async () => json(token); await api.getCsrfToken(); calls = [];
handler = async () => json({ code: "CSRF_INVALID", message: "Invalid token" }, 403);
await assert.rejects(api.checkout(body, "request-1"), (e) => e.code === "CSRF_INVALID" && !e.outcomeUnknown);
assert.equal(calls.length, 1, "CSRF failure does not silently resend checkout");
handler = async () => json(token); await api.getCsrfToken();

calls = [];
handler = async () => json({ code: "INTERNAL_ERROR", message: "Error" }, 500);
await assert.rejects(api.checkout(body, "request-1"), (e) => e.status === 500 && e.outcomeUnknown);

handler = async () => new Response("<html>unexpected</html>", { status: 200 });
await assert.rejects(api.checkout(body, "request-1"), (e) => e.code === "PROTOCOL_ERROR" && e.outcomeUnknown);

calls = [];
handler = async (_, options) => new Promise((resolve, reject) => {
  options.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
});
await assert.rejects(api.checkout(body, "request-1", { timeoutMs: 5 }), (e) => e.code === "TIMEOUT" && e.outcomeUnknown);
assert.equal(calls.length, 1);

calls = [];
await assert.rejects(api.checkout(), (e) => e.code === "INVALID_REQUEST" && !e.outcomeUnknown);
assert.equal(calls.length, 0, "Legacy checkout() never sends a write");

handler = async () => new Response(null, { status: 204 });
await api.logout();
api.invalidateCsrfToken();
let finishOld;
handler = async () => new Promise((resolve) => { finishOld = resolve; });
const oldRequest = api.getCart();
api.invalidateCsrfToken();
handler = async () => json(token);
await api.getCsrfToken();
finishOld(json({ code: "AUTH_REQUIRED", message: "Old session" }, 401));
await assert.rejects(oldRequest, (e) => e.status === 401);
calls = [];
await api.getCsrfToken();
assert.equal(calls.length, 0, "Delayed old-session failure does not clear new token");
console.log("PASS: login encoding, CSRF lifecycle/coalescing, 409 details, no write retries, unknown results, timeout, legacy-call guard and empty logout response.");
