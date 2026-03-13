import { useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

/**
 * Calls `callback` every time the app comes back to the foreground.
 * Use this in screens that need to re-fetch after the user returns
 * from another app — useFocusEffect alone won't catch this case.
 */
export function useOnAppForeground(callback: () => void) {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        // Small delay to let startAutoRefresh() complete the token
        // refresh before we fire any queries
        setTimeout(() => callbackRef.current(), 500);
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);
}