import type { NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type TabParamList = {
  Home: undefined;
  Leads: undefined;
  Tasks: undefined;
  Attendance: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  LeadDetail: { leadId: string; name?: string };
  AddLead: undefined;
  UpdateLead: { leadId: string };
  TaskDetail: { taskId: string };
  NewTask: { leadId?: string; leadName?: string; taskId?: string } | undefined;
  Leave: undefined;
  Profile: undefined;
  Inventory: undefined;
  PropertyDetail: { id: string };
  AddProperty: undefined;
  Schedule: undefined;
  Chats: undefined;
  Conversation: { id: string; title?: string };
  NewChat: undefined;
  EditLead: { leadId: string };
  EditRequirements: { leadId: string };
  TransferLead: { leadId: string };
  PickProperty: { leadId: string; select?: boolean };
  TeamPipeline: undefined;
  BulkUpload: undefined;
  TeamWorkload: undefined;
  Approvals: undefined;
  PersonTasks: { assignedTo: string; name: string };
  PersonLeads: { assignedTo: string; name: string };
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
