/* Chat display rules. Pure; unit tested. Types are structural so tests need no imports. */

type Person = { _id: string; name: string };
type Room = { type: string; name?: string; participants: Person[]; leadId?: { name: string } | string | null };
type Message = { _id: string; sender: Person | null; createdAt: string; deliveredTo?: { user: string }[]; seenBy?: { user: string }[] };

/* A direct chat is named after the other person; groups by their name. */
export const conversationTitle = (room: Room, myId: string) => {
  if (room.name) return room.name;
  const others = room.participants.filter((person) => person._id !== myId);
  if (room.type === "lead" && room.leadId && typeof room.leadId === "object") return `Lead: ${room.leadId.name}`;
  if (!others.length) return "Just you";
  if (others.length === 1) return others[0]!.name;
  return `${others[0]!.name} +${others.length - 1}`;
};

export const otherPerson = <P extends Person>(room: { type: string; participants: P[] }, myId: string): P | null =>
  room.type === "direct" ? room.participants.find((person) => person._id !== myId) || null : null;

export type Tick = "sending" | "failed" | "sent" | "delivered" | "seen";

/* Receipt state of my own message: seen by anyone else beats delivered beats sent. */
export const receipt = (message: Message & { localState?: "sending" | "failed" }, myId: string): Tick => {
  if (message.localState) return message.localState;
  const others = (list?: { user: string }[]) => (list || []).some((entry) => entry.user !== myId);
  if (others(message.seenBy)) return "seen";
  if (others(message.deliveredTo)) return "delivered";
  return "sent";
};

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/* List timestamps: "4:30 PM" today, "Yesterday", weekday this week, else "12 Oct". */
export const chatTime = (value?: string, now = new Date()) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  if (sameDay(date, now)) {
    const h = date.getHours();
    return `${h % 12 || 12}:${String(date.getMinutes()).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  const days = (now.getTime() - date.getTime()) / 86400000;
  if (days < 6) return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()]!;
  return `${date.getDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]}`;
};

/* Adds a message once, keeps time order, and swaps an optimistic copy for the server's. */
export const mergeMessage = <T extends Message & { localState?: string; clientId?: string }>(list: T[], incoming: T, clientId?: string) => {
  const withoutDuplicate = list.filter((item) => item._id !== incoming._id && (!clientId || item._id !== clientId));
  return [...withoutDuplicate, incoming].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
};

/* Whether to print a day divider above message i (list in time order). */
export const startsNewDay = (list: { createdAt: string }[], index: number) =>
  index === 0 || new Date(list[index - 1]!.createdAt).toDateString() !== new Date(list[index]!.createdAt).toDateString();
