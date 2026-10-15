import { useCallback, useState } from "react";
import { applyBoardAction, fetchBoard, lastUndoable, undoLastChange, type BoardSnapshot } from "../api/coworkingBoard";
import { errorMessage } from "../api/client";
import type { BoardAction } from "./coworkingBoard";
import { useQuery } from "./useQuery";

/*
 * The booking board for a screen: loaded on open and on every return to the
 * screen, so a change made on another screen (or device) shows. `run` applies
 * one action against the server's latest copy.
 */
export const useBoard = () => {
  const query = useQuery(fetchBoard, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = useCallback(
    async (work: () => Promise<BoardSnapshot>) => {
      setBusy(true);
      setError(null);
      try {
        const snapshot = await work();
        query.setData(snapshot);
        return true;
      } catch (err) {
        setError(errorMessage(err));
        query.reload();
        return false;
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query.setData, query.reload],
  );

  const run = useCallback((action: BoardAction) => finish(() => applyBoardAction(action)), [finish]);
  const undo = useCallback(() => finish(undoLastChange), [finish]);

  return { ...query, board: query.data?.state || null, busy, actionError: error, setActionError: setError, run, undo, undoable: lastUndoable() };
};
