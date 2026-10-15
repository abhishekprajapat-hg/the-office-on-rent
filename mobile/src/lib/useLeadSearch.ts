import { useEffect, useState } from "react";
import { listLeads } from "../api/leads";
import type { Lead } from "../api/types";

/*
 * Leads for a "link a lead" picker, searched on the server so every lead is
 * reachable (the web loads the whole list; a phone searches instead).
 */
export const useLeadSearch = (active: boolean) => {
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<Lead[] | null>(null);
  useEffect(() => {
    if (!active) return;
    let alive = true;
    listLeads({ page: 1, limit: 50, search: query })
      .then((result) => alive && setLeads(result.leads))
      .catch(() => alive && setLeads([]));
    return () => {
      alive = false;
    };
  }, [active, query]);
  return { leads, search: setQuery };
};
