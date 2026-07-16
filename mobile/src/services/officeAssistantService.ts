import api from "./api";

export type OfficeAssistantResponse = {
  intent?: string;
  query?: string;
  answer?: string;
  data?: Record<string, unknown>;
  suggestions?: string[];
};

export const askOfficeAssistant = async (query: string): Promise<OfficeAssistantResponse> => {
  const res = await api.post("/assistant/ask", { query });
  return {
    intent: String(res.data?.intent || ""),
    query: String(res.data?.query || query || ""),
    answer: String(res.data?.answer || ""),
    data: (res.data?.data || {}) as Record<string, unknown>,
    suggestions: Array.isArray(res.data?.suggestions) ? res.data.suggestions.map((item: unknown) => String(item || "")) : [],
  };
};
