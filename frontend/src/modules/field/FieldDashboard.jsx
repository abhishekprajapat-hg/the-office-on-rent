import React, { useEffect, useState } from "react";
import AssetVault from "../inventory/AssetVault";
import FieldOps from "./FieldOps";
import TeamChat from "../chat/TeamChat";
import MasterSchedule from "../calendar/MasterSchedule";
import LeadsMatrix from "../leads/LeadsMatrix";
import FieldOverview from "./components/FieldOverview";
import api from "../../services/api";
import { toErrorMessage } from "../../utils/errorMessage";

const DEFAULT_TASKS = [
  {
    id: "visit-1",
    title: "Site Visit",
    detail: "Skyline Towers - 10:00 AM",
    status: "Pending",
  },
  {
    id: "visit-2",
    title: "Client Follow Up",
    detail: "Call after visit completion",
    status: "Pending",
  },
  {
    id: "visit-3",
    title: "Document Sync",
    detail: "Upload photos and unit notes",
    status: "Pending",
  },
];

const getStoredUserId = () => {
  try {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    return String(user?._id || user?.id || "").trim();
  } catch {
    return "";
  }
};

const normalizeStatus = (value) => String(value || "").trim().toUpperCase();

const buildFieldExecutiveMetrics = (leads = []) => {
  const leadsAssigned = leads.length;
  const activeClients = leads.filter((lead) =>
    !["CLOSED", "LOST"].includes(normalizeStatus(lead?.status))
  ).length;
  const siteVisitsScheduled = leads.filter((lead) =>
    ["SITE_VISIT_REQUIRED", "SITE_VISIT"].includes(normalizeStatus(lead?.status))
  ).length;
  const ongoingNegotiations = leads.filter((lead) =>
    ["REQUESTED", "INTERESTED"].includes(normalizeStatus(lead?.status))
  ).length;
  const dealsClosed = leads.filter((lead) => normalizeStatus(lead?.status) === "CLOSED").length;
  const dealsLost = leads.filter((lead) => normalizeStatus(lead?.status) === "LOST").length;
  const revenueGenerated = leads.reduce((total, lead) => {
    if (normalizeStatus(lead?.status) !== "CLOSED") return total;
    return total + Math.max(0, Number(lead?.brokerageReceived) || 0);
  }, 0);

  return {
    leadsAssigned,
    activeClients,
    siteVisitsScheduled,
    ongoingNegotiations,
    dealsClosed,
    dealsLost,
    revenueGenerated,
  };
};

const FieldDashboard = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [inventoryCount, setInventoryCount] = useState(0);
  const [leadCount, setLeadCount] = useState(0);
  const [leadRows, setLeadRows] = useState([]);
  const [fieldMetrics, setFieldMetrics] = useState(buildFieldExecutiveMetrics([]));
  const [tasks, setTasks] = useState(DEFAULT_TASKS);

  useEffect(() => {
    const fetchDashboardData = async () => {
      const currentUserId = getStoredUserId();
      const [inventoryResult, leadsResult] = await Promise.allSettled([
        api.get("/inventory"),
        api.get("/leads", {
          params: currentUserId ? { assignedTo: currentUserId } : {},
        }),
      ]);

      if (inventoryResult.status === "fulfilled") {
        const rows = inventoryResult.value.data?.assets || [];
        setInventoryCount(Array.isArray(rows) ? rows.length : 0);
      } else {
        console.error(
          "Field dashboard inventory error:",
          toErrorMessage(inventoryResult.reason, "Unknown error"),
        );
      }

      if (leadsResult.status === "fulfilled") {
        const rows = leadsResult.value.data?.leads || [];
        setLeadRows(Array.isArray(rows) ? rows : []);
        setLeadCount(Array.isArray(rows) ? rows.length : 0);
        setFieldMetrics(buildFieldExecutiveMetrics(Array.isArray(rows) ? rows : []));
      } else {
        setLeadRows([]);
        setFieldMetrics(buildFieldExecutiveMetrics([]));
        console.error(
          "Field dashboard leads error:",
          toErrorMessage(leadsResult.reason, "Unknown error"),
        );
      }
    };

    fetchDashboardData();
  }, []);

  const completeTask = (taskId) => {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, status: "Done" } : task,
      ),
    );
  };

  const renderContent = () => {
    if (activeTab === "dashboard") {
      return (
        <FieldOverview
          tasks={tasks}
          inventoryCount={inventoryCount}
          leadCount={leadCount}
          metrics={fieldMetrics}
          leads={leadRows}
          onCompleteTask={completeTask}
          onOpen={setActiveTab}
        />
      );
    }

    if (activeTab === "leads") {
      return <LeadsMatrix />;
    }

    if (activeTab === "inventory") {
      return <AssetVault />;
    }

    if (activeTab === "map") {
      return <FieldOps />;
    }

    if (activeTab === "chat") {
      return <TeamChat />;
    }

    if (activeTab === "calendar") {
      return <MasterSchedule />;
    }

    return (
      <FieldOverview
        tasks={tasks}
        inventoryCount={inventoryCount}
        leadCount={leadCount}
        metrics={fieldMetrics}
        leads={leadRows}
        onCompleteTask={completeTask}
        onOpen={setActiveTab}
      />
    );
  };

  return (
    <div className="ui-page-shell flex h-full w-full flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
};

export default FieldDashboard;
