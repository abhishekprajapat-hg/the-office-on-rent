import { api } from "./client";

export type ChatPerson = { _id: string; name: string; role?: string; roleLabel?: string; profileImageUrl?: string };

export type Receipt = { user: string; at?: string };

export type SharedProperty = {
  inventoryId: string;
  title?: string;
  location?: string;
  price?: number;
  status?: string;
  image?: string;
};

export type ChatMessage = {
  _id: string;
  room: string;
  sender: ChatPerson | null;
  type?: "text" | "property" | "media" | "system" | string;
  text?: string;
  sharedProperty?: SharedProperty | null;
  mediaAttachments?: { url: string; name?: string; mimeType?: string }[];
  deliveredTo?: Receipt[];
  seenBy?: Receipt[];
  isDeleted?: boolean;
  createdAt: string;
  /* Client-only: a message still on its way, or one that failed to send. */
  localState?: "sending" | "failed";
};

export type Conversation = {
  _id: string;
  type: "direct" | "group" | "lead" | "broadcast" | string;
  name?: string;
  participants: ChatPerson[];
  lastMessage?: string;
  lastMessageAt?: string;
  lastMessageSender?: ChatPerson | null;
  unreadCount?: number;
  leadId?: { _id: string; name: string } | string | null;
};

export const listConversations = async () => {
  const res = await api.get<{ conversations: Conversation[] }>("/chat/conversations");
  return res.data?.conversations || [];
};

export const listContacts = async () => {
  const res = await api.get<{ contacts: ChatPerson[] }>("/chat/contacts");
  return res.data?.contacts || [];
};

/* Oldest first. `before` (a message's createdAt) pages backwards. */
export const getMessages = async (conversationId: string, before?: string, limit = 40) => {
  const res = await api.get<{ messages: ChatMessage[] }>(`/chat/conversations/${conversationId}/messages`, {
    params: { limit, ...(before ? { before } : {}) },
  });
  return res.data?.messages || [];
};

export const sendMessage = async (conversationId: string, text: string) => {
  const res = await api.post<{ conversation: Conversation; message: ChatMessage }>("/chat/messages", { conversationId, text });
  return res.data?.message || null;
};

export const openDirectChat = async (recipientId: string) => {
  const res = await api.post<{ room: Conversation }>("/chat/rooms/direct", { recipientId });
  return res.data?.room || null;
};

export const markRead = async (conversationId: string) => {
  await api.patch(`/chat/rooms/${conversationId}/read`);
};
