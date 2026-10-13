import * as Linking from "expo-linking";
import type { LinkingOptions } from "@react-navigation/native";
import type { RootStackParamList } from "./types";

/*
 * Deep links: theofficeonrent://leads/<id> opens a lead, and so on. The same
 * map gives the web preview real URLs, which is how screens are checked.
 */
export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL("/"), "theofficeonrent://"],
  config: {
    screens: {
      Login: "login",
      Tabs: {
        screens: {
          Home: "",
          Leads: "leads",
          Tasks: "tasks",
          Attendance: "attendance",
          More: "more",
        },
      },
      AddLead: "leads/new",
      TeamPipeline: "leads/team",
      BulkUpload: "leads/upload",
      PersonLeads: "leads/team/:assignedTo",
      LeadDetail: "leads/:leadId",
      UpdateLead: "leads/:leadId/update",
      EditLead: "leads/:leadId/edit",
      EditRequirements: "leads/:leadId/requirements",
      TransferLead: "leads/:leadId/transfer",
      PickProperty: "leads/:leadId/link-property",
      NewTask: "tasks/new",
      TeamWorkload: "tasks/team",
      PersonTasks: "tasks/team/:assignedTo",
      TaskDetail: "tasks/:taskId",
      Leave: "attendance/leave",
      Profile: "profile",
      Schedule: "schedule",
      Approvals: "approvals",
      Chats: "chats",
      NewChat: "chats/new",
      Conversation: "chats/:id",
      Inventory: "inventory",
      AddProperty: "inventory/new",
      PropertyDetail: "inventory/:id",
    },
  },
};
