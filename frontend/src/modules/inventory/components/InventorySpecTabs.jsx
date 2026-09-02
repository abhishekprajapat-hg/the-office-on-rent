import React from "react";
import { FileText, History } from "lucide-react";
import { Card, CardContent, Tabs, TabButton, cn } from "../../../components/ui";
import { AmenityChips, KeyValue, SectionTitle } from "./InventoryKeyValue";

/*
 * Specification / Documents / Activity / Approvals, matching the reference:
 * four scannable blocks on an auto-fit minmax(216px) grid at a 20px gap,
 * each a .sectitle over a 100px .kv, then amenities as chips.
 */

const Block = ({ title, rows }) => {
  const meaningful = rows.filter((row) => row.value !== null && row.value !== undefined && row.value !== "" && row.value !== "-");
  if (!meaningful.length) return null;
  return (
    <div>
      <SectionTitle>{title}</SectionTitle>
      <KeyValue rows={meaningful} labelWidth="100px" />
    </div>
  );
};

const InventorySpecTabs = ({
  activeTab,
  onTabChange,
  showApprovals,
  showActivity,
  specBlocks = [],
  amenities = [],
  documents = [],
  floorPlans = [],
  videoTours = [],
  activities = [],
  approvalRows = [],
  formatDate,
}) => {
  const tabs = [
    { key: "specification", label: "Specification" },
    { key: "documents", label: "Documents" },
    ...(showActivity ? [{ key: "activity", label: "Activity" }] : []),
    ...(showApprovals ? [{ key: "approvals", label: "Approvals" }] : []),
  ];

  const fileList = (items, emptyLabel) =>
    items.length ? (
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {items.map((item, index) => {
          const url = typeof item === "string" ? item : item?.url;
          const name = typeof item === "string" ? item.split("/").pop() : item?.name || item?.url?.split("/").pop();
          return (
            <li key={`${url}-${index}`}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-slate-200 px-2.5 py-2 text-[12.8px]",
                  "text-slate-700 outline-none transition hover:bg-slate-50",
                  "focus-visible:ring-2 focus-visible:ring-blue-500/40",
                  "dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800",
                )}
              >
                <FileText aria-hidden="true" size={14} className="shrink-0 text-slate-400" />
                <span className="truncate">{name || "Untitled file"}</span>
              </a>
            </li>
          );
        })}
      </ul>
    ) : (
      <p className="text-[12.8px] text-slate-500 dark:text-slate-400">{emptyLabel}</p>
    );

  return (
    <Card>
      <Tabs className="px-4">
        {tabs.map((tab) => (
          <TabButton key={tab.key} active={tab.key === activeTab} onClick={() => onTabChange(tab.key)}>
            {tab.label}
          </TabButton>
        ))}
      </Tabs>

      <CardContent>
        {activeTab === "specification" ? (
          <>
            <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(216px,1fr))]">
              {specBlocks.map((block) => (
                <Block key={block.title} title={block.title} rows={block.rows} />
              ))}
            </div>
            {amenities.length ? (
              <div className="mt-5">
                <SectionTitle>Amenities</SectionTitle>
                <AmenityChips items={amenities} />
              </div>
            ) : null}
          </>
        ) : null}

        {activeTab === "documents" ? (
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(216px,1fr))]">
            <div>
              <SectionTitle>Documents</SectionTitle>
              {fileList(documents, "No documents attached.")}
            </div>
            <div>
              <SectionTitle>Floor plans</SectionTitle>
              {fileList(floorPlans, "No floor plans attached.")}
            </div>
            <div>
              <SectionTitle>Video tours</SectionTitle>
              {fileList(videoTours, "No video tours attached.")}
            </div>
          </div>
        ) : null}

        {activeTab === "activity" ? (
          activities.length ? (
            <ol className="relative m-0 list-none py-1 pl-[22px] pr-0">
              <span
                aria-hidden="true"
                className="absolute bottom-1.5 left-[6px] top-1.5 w-[2px] rounded-full bg-slate-200 dark:bg-slate-700"
              />
              {activities.map((row, index) => (
                <li key={row?._id || index} className={cn("relative", index === activities.length - 1 ? "pb-0" : "pb-3.5")}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute -left-[19px] top-[5px] h-[9px] w-[9px] rounded-full border-2",
                      index === 0
                        ? "border-blue-600 bg-blue-600 dark:border-blue-400 dark:bg-blue-400"
                        : "border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900",
                    )}
                  />
                  <div className="text-[12.8px] leading-5 text-slate-700 dark:text-slate-300">
                    {row?.message || row?.action || "Activity"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {formatDate?.(row?.createdAt)}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="flex items-center gap-2 text-[12.8px] text-slate-500 dark:text-slate-400">
              <History aria-hidden="true" size={14} />
              No activity recorded for this property.
            </p>
          )
        ) : null}

        {activeTab === "approvals" ? <KeyValue rows={approvalRows} labelWidth="118px" /> : null}
      </CardContent>
    </Card>
  );
};

export default InventorySpecTabs;
