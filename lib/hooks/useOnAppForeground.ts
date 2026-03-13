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

  // Keep the ref current so we don't need callback in the dep array
  useEffect(() => {
    callbackRef.current = callback;
  });

  useEffect(() => {
    const sub = AppState.addEventListener("change", (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === "active"
      ) {
        callbackRef.current();
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);
}