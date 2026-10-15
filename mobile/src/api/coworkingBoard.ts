import { api } from "./client";
import { actionConflict, boardReducer, hydrate, stripDerived, type BoardAction, type BoardState } from "../lib/coworkingBoard";

/*
 * The booking board document (/coworking/board) - the same one the web board
 * reads and writes. Saves carry the version they were built on; the server
 * refuses a stale one (409) rather than letting one device erase another's work.
 */

export type BoardSnapshot = { state: BoardState; version: number; updatedAt: string | null; updatedByName: string };

export const fetchBoard = async (): Promise<BoardSnapshot> => {
  const res = await api.get("/coworking/board");
  return {
    state: hydrate(res.data?.state),
    version: Number(res.data?.version || 0),
    updatedAt: res.data?.updatedAt || null,
    updatedByName: String(res.data?.updatedByName || ""),
  };
};

const saveBoard = async (state: BoardState, version: number) => {
  const res = await api.put("/coworking/board", {
    state: { cabins: stripDerived(state.cabins), activity: state.activity.slice(0, 200) },
    version,
  });
  return { version: Number(res.data?.version ?? version + 1), state: res.data?.state ? hydrate(res.data.state) : state };
};

const isConflict = (error: unknown) => (error as { response?: { status?: number } })?.response?.status === 409;

export class BoardConflictError extends Error {}

/* The last change made from this app session, so it can be undone while nobody else has saved since. */
let lastChange: { before: BoardState; savedVersion: number; title: string } | null = null;
export const lastUndoable = () => lastChange;

/*
 * Apply one action to the latest board and save it. On a 409 (someone saved in
 * between) it reloads and re-applies, up to three times; the action is
 * re-checked against the fresh board each time.
 */
export const applyBoardAction = async (action: BoardAction): Promise<BoardSnapshot> => {
  for (let attempt = 0; ; attempt += 1) {
    const current = await fetchBoard();
    const problem = actionConflict(current.state, action);
    if (problem) throw new BoardConflictError(problem);
    const next = boardReducer(current.state, action);
    try {
      const saved = await saveBoard(next, current.version);
      lastChange = { before: current.state, savedVersion: saved.version, title: next.activity[0]?.title || "Last change" };
      return { state: hydrate(saved.state), version: saved.version, updatedAt: new Date().toISOString(), updatedByName: "" };
    } catch (error) {
      if (isConflict(error) && attempt < 2) continue;
      if (isConflict(error)) throw new BoardConflictError("The board keeps changing on another device. Try again in a moment.");
      throw error;
    }
  }
};

/* Undo the last change from this session - only while the board is still exactly as it left it (web UNDO). */
export const undoLastChange = async (): Promise<BoardSnapshot> => {
  const change = lastChange;
  if (!change) throw new BoardConflictError("Nothing to undo.");
  const current = await fetchBoard();
  if (current.version !== change.savedVersion) {
    lastChange = null;
    throw new BoardConflictError("Someone has changed the board since, so undoing would erase their work.");
  }
  const saved = await saveBoard(change.before, current.version);
  lastChange = null;
  return { state: hydrate(saved.state), version: saved.version, updatedAt: new Date().toISOString(), updatedByName: "" };
};

/* Clients with a birthday this week from the coworking client records (web BirthdayReminders). */
export const fetchClientBirthdays = async () => {
  const res = await api.get<{ clients: { _id: string; companyName?: string; contactPerson?: string; dateOfBirth?: string }[] }>("/coworking/clients/birthdays");
  return res.data?.clients || [];
};
