import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { errorMessage } from "../api/client";

/*
 * Loads data for a screen and reloads it whenever the screen regains focus,
 * so coming back from an edit shows the edit. `refreshing` is the
 * pull-to-refresh spinner; `loading` is only the first load.
 */
export const useQuery = <T,>(loader: () => Promise<T>, deps: unknown[] = []) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const alive = useRef(true);
  const loadedOnce = useRef(false);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async (mode: "initial" | "refresh" | "silent") => {
    if (mode === "refresh") setRefreshing(true);
    try {
      const result = await loaderRef.current();
      if (!alive.current) return;
      setData(result);
      setError(null);
      loadedOnce.current = true;
    } catch (err) {
      if (!alive.current) return;
      // A silent background reload keeps showing the data it already has.
      if (mode !== "silent" || !loadedOnce.current) setError(errorMessage(err));
    } finally {
      if (alive.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadedOnce.current = false;
    run("initial");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      run("silent");
    }, [run]),
  );

  return {
    data,
    error,
    loading,
    refreshing,
    refresh: useCallback(() => run("refresh"), [run]),
    reload: useCallback(() => run("silent"), [run]),
    setData,
  };
};
