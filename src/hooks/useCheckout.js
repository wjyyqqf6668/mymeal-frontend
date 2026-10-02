import { useEffect, useMemo, useState } from "react";
import { checkout } from "../utils";
import { createCheckoutFlow } from "../checkout/checkoutFlow";

export default function useCheckout(customerId) {
  const flow = useMemo(() => createCheckoutFlow({ customerId, submit: checkout,
    // Access through methods so denied sessionStorage is handled by the state machine.
    storage: { getItem: (key) => window.sessionStorage.getItem(key),
      setItem: (key, value) => window.sessionStorage.setItem(key, value),
      removeItem: (key) => window.sessionStorage.removeItem(key) },
  }), [customerId]);
  const [state, setState] = useState(() => flow.getState());
  useEffect(() => flow.subscribe(setState), [flow]);
  return { ...state, flow };
}
