import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_REQUIRED_EVENT, getCurrentUser, login, logout,
  refreshCsrfToken, invalidateCsrfToken } from "../utils";

const initial = { phase: "loading", user: null, error: null, busy: false };

export default function useAuth() {
  const [state, setState] = useState(initial);
  const sequence = useRef(0);
  const mounted = useRef(false);
  const commit = useCallback((id, next) => {
    if (mounted.current && sequence.current === id) setState(next);
  }, []);

  const restoreSession = useCallback(async () => {
    const id = ++sequence.current;
    commit(id, { ...initial, busy: true });
    try {
      await refreshCsrfToken();
      const user = await getCurrentUser();
      commit(id, { phase: "authenticated", user, error: null, busy: false });
    } catch (error) {
      if (error.status === 401) {
        commit(id, { phase: "anonymous", user: null, error: null, busy: false });
      } else {
        commit(id, { phase: "error", user: null, error: "Unable to check your session. Please try again.", busy: false });
      }
    }
  }, [commit]);

  useEffect(() => {
    mounted.current = true;
    restoreSession();
    const expired = () => {
      sequence.current += 1;
      invalidateCsrfToken();
      setState({ phase: "anonymous", user: null, error: "Your session expired. Please sign in again.", busy: false });
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, expired);
    return () => {
      mounted.current = false;
      sequence.current += 1;
      window.removeEventListener(AUTH_REQUIRED_EVENT, expired);
    };
  }, [restoreSession]);

  const signIn = useCallback(async (credentials) => {
    const id = ++sequence.current;
    commit(id, { phase: "anonymous", user: null, error: null, busy: true });
    let accepted = false;
    try {
      await login(credentials);
      accepted = true;
      await refreshCsrfToken();
      const user = await getCurrentUser();
      commit(id, { phase: "authenticated", user, error: null, busy: false });
      return true;
    } catch (error) {
      const uncertain = accepted || error.outcomeUnknown;
      commit(id, { phase: uncertain ? "error" : "anonymous", user: null, busy: false,
        error: uncertain ? "Please check your session to confirm whether sign-in completed." : error.message });
      return false;
    }
  }, [commit]);

  const signOut = useCallback(async () => {
    const id = ++sequence.current;
    // Gate business UI while logout is pending; a timeout requires session verification.
    commit(id, { phase: "loading", user: null, error: null, busy: true });
    try {
      await logout();
    } catch (error) {
      if (error.status !== 401) {
        commit(id, { phase: "error", user: null, busy: false,
          error: "Sign-out was not confirmed. Please check your session." });
        return;
      }
    }
    try {
      await refreshCsrfToken();
      commit(id, { phase: "anonymous", user: null, error: null, busy: false });
    } catch (error) {
      commit(id, { phase: "anonymous", user: null, busy: false,
        error: "Signed out. Unable to prepare the next request; please try again." });
    }
  }, [commit]);

  return { ...state, signIn, signOut, restoreSession };
}
