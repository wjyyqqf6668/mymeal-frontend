import { useCallback, useEffect, useRef, useState } from "react";
import { getCart } from "../utils";

function checkedCart(data) {
  if (!data?.id || !Array.isArray(data.items) || typeof data.total_price !== "string") {
    throw new Error("Unable to read the cart. Please refresh.");
  }
  return data;
}

export default function useCart() {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const sequence = useRef(0);
  const mounted = useRef(false);
  const reload = useCallback(async () => {
    const id = ++sequence.current;
    setState((old) => ({ ...old, loading: true, error: null }));
    try {
      const data = checkedCart(await getCart());
      if (mounted.current && sequence.current === id) setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      if (mounted.current && sequence.current === id) setState({ data: null, loading: false, error: error.message });
      return null;
    }
  }, []);
  const mutate = useCallback(async (action) => {
    const id = ++sequence.current;
    setState((old) => ({ ...old, loading: true, error: null }));
    try {
      const data = checkedCart(await action());
      if (mounted.current && sequence.current === id) setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      // Refresh is a read, never a replay of the uncertain mutation.
      if (mounted.current && sequence.current === id) await reload();
      throw error;
    }
  }, [reload]);
  useEffect(() => {
    mounted.current = true; reload();
    return () => { mounted.current = false; sequence.current += 1; };
  }, [reload]);
  return { ...state, reload, mutate };
}
