import { api } from "./client";

export type AssistantLead = { id: string; name: string; phone?: string; status?: string; projectInterested?: string; assignee?: string; inventory?: string };
export type AssistantInventory = { id: string; label: string; status?: string; location?: string; price?: number; through?: string; soldThrough?: string; soldLeadName?: string };
export type AssistantPerformer = { rank: number; userId: string; name: string; role?: string; profileImageUrl?: string; totalLeads: number; closedLeads: number; interestedLeads: number; conversionRate: number };
export type AssistantReply = {
  intent: string;
  answer: string;
  data: {
    leads?: AssistantLead[];
    interestedLeads?: AssistantLead[];
    inventory?: AssistantInventory[];
    soldInventory?: AssistantInventory[];
    performers?: AssistantPerformer[];
    inventoryByStatus?: Record<string, number>;
    leadByStatus?: Record<string, number>;
  };
};

/* POST /assistant/ask - answers from the caller's own leads and inventory scope. */
export const askAssistant = async (query: string) => {
  const res = await api.post<AssistantReply>("/assistant/ask", { query });
  return { intent: res.data?.intent || "", answer: res.data?.answer || "", data: res.data?.data || {} } as AssistantReply;
};
