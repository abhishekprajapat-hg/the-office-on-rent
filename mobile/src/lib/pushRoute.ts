/*
 * Where a tapped push notification should open. The server writes web paths
 * (url: "/chat", "/tasks") plus a tag naming the exact thing ("chat:<roomId>",
 * "task:<taskId>:<recipient>"); the tag wins when it is specific. Returns an
 * app deep-link path. Pure; unit tested.
 */
export const pushRoute = (data: { url?: unknown; tag?: unknown } | null | undefined) => {
  const tag = String(data?.tag || "");
  const chat = tag.match(/^chat:([a-f0-9]{24})$/i);
  if (chat) return `chats/${chat[1]}`;
  const task = tag.match(/^task:([a-f0-9]{24})(?::|$)/i);
  if (task) return `tasks/${task[1]}`;
  const lead = tag.match(/^lead:([a-f0-9]{24})/i);
  if (lead) return `leads/${lead[1]}`;

  const url = String(data?.url || "/").split("?")[0]!.replace(/^\/+/, "");
  if (/^leads\/[a-f0-9]{24}$/i.test(url)) return url;
  if (/^tasks\/[a-f0-9]{24}$/i.test(url)) return url;
  if (url.startsWith("chat")) return "chats";
  if (url.startsWith("tasks")) return "tasks";
  if (url.startsWith("leads") || url.startsWith("my-leads")) return "leads";
  if (url.startsWith("attendance")) return "attendance";
  if (url.startsWith("admin/notifications")) return "approvals";
  return "";
};
