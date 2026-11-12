import { useEffect, useState } from "react";
import { getEnterpriseMeta } from "../../services/enterpriseService";

/* Shared by the Enterprise Leasing screens (Oct 2026 update 02). */
export const SEVERITY_TONE = { high: "bad", medium: "warn", low: "mute" };
export const STATUS_TONE = { OCCUPIED: "ok", READY_VACANT: "bad", FIT_OUT: "info", NEGOTIATION: "mute", TENANT_ONBOARDING: "info", NOTICE_EXIT: "warn", TRANSITION: "warn", CLOSED: "mute" };

let metaCache = null;
export const useEnterpriseMeta = () => {
  const [meta, setMeta] = useState(metaCache);
  useEffect(() => {
    if (metaCache) return;
    getEnterpriseMeta().then((m) => { metaCache = m; setMeta(m); }).catch(() => {});
  }, []);
  return meta;
};
