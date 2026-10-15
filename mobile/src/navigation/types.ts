import type { NavigatorScreenParams } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

export type TabParamList = {
  Home: undefined;
  Leads: undefined;
  Tasks: undefined;
  Attendance: undefined;
  TeamTab: undefined;
  ApprovalsTab: undefined;
  VisitsTab: undefined;
  BookingsTab: undefined;
  ClientsTab: undefined;
  ListingsTab: undefined;
  More: undefined;
};

export type RootStackParamList = {
  Login: undefined;
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  LeadDetail: { leadId: string; name?: string };
  AddLead: undefined;
  UpdateLead: { leadId: string };
  TaskDetail: { taskId: string };
  NewTask: { leadId?: string; leadName?: string; taskId?: string; assignTo?: string; lockAssignee?: boolean } | undefined;
  Leave: undefined;
  Profile: undefined;
  Inventory: undefined;
  PropertyDetail: { id: string };
  AddProperty: undefined;
  Schedule: undefined;
  Chats: undefined;
  Conversation: { id: string; title?: string };
  NewChat: { group?: boolean } | undefined;
  Broadcast: undefined;
  EditLead: { leadId: string };
  EditRequirements: { leadId: string };
  TransferLead: { leadId: string };
  PickProperty: { leadId?: string; select?: boolean; chatId?: string };
  TeamPipeline: undefined;
  BulkUpload: undefined;
  TeamWorkload: undefined;
  Approvals: undefined;
  Notifications: undefined;
  Settings: undefined;
  Salary: undefined;
  Performance: undefined;
  AttendanceHistory: undefined;
  LeadPool: undefined;
  Contacts: undefined;
  Projects: undefined;
  ProjectDetail: { id: string };
  Finance: undefined;
  RecordPayment: undefined;
  Reports: undefined;
  Leaderboard: undefined;
  Targets: undefined;
  FieldOps: undefined;
  PersonTasks: { assignedTo: string; name: string };
  PersonLeads: { assignedTo: string; name: string };
  Bookings: undefined;
  NewBooking: { floorId?: string; cabinId?: string } | undefined;
  Clients: undefined;
  ClientDetail: { id: string };
  AddClient: undefined;
  AdminConsole: undefined;
  Users: { focus?: "access" } | undefined;
  UserDetail: { id: string; name?: string };
  AddUser: undefined;
  MetaAds: undefined;
  SystemSettings: { section?: "shift" | "company" } | undefined;
  Search: undefined;
};

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
