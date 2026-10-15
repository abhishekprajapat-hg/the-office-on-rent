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
  AddProperty: { id?: string } | undefined;
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
  MemberPerformance: { userId: string; name?: string };
  Roles: undefined;
  AttendanceHistory: undefined;
  TeamAttendance: undefined;
  MemberAttendance: { userId: string; name?: string };
  Offices: undefined;
  LeadPool: undefined;
  Contacts: undefined;
  Projects: undefined;
  ProjectDetail: { id: string };
  ProjectForm: { id?: string } | undefined;
  PropertyActivity: { id: string; title?: string };
  MyRequests: undefined;
  Finance: undefined;
  Revenue: undefined;
  TeamSalary: undefined;
  MemberSalary: { userId: string; name?: string };
  PayrollPolicy: undefined;
  RecordPayment: undefined;
  Reports: undefined;
  Leaderboard: undefined;
  Targets: undefined;
  FieldOps: undefined;
  PersonTasks: { assignedTo: string; name: string };
  PersonLeads: { assignedTo: string; name: string };
  /* The coworking booking board; select opens it ready to pick cabins for onboarding. */
  Bookings: { select?: boolean } | undefined;
  Cabin: { code: string };
  Onboard: { codes?: string[]; clientId?: string };
  BoardActivity: undefined;
  Clients: undefined;
  /* A board client: their identity on the booking board. */
  ClientDetail: { id: string };
  AdminConsole: undefined;
  Users: { focus?: "access" } | undefined;
  UserDetail: { id: string; name?: string };
  AddUser: undefined;
  MetaAds: undefined;
  SystemSettings: { section?: "shift" | "company" } | undefined;
  Search: undefined;
  /* The privacy policy or terms, signed in or out. */
  Legal: { doc: "privacy" | "terms" };
  /* Ask about leads, inventory and the team (POST /assistant/ask). */
  Assistant: undefined;
  /* The "it worked" page after a create or send; `next` offers the obvious follow-up. */
  Success: {
    title: string;
    message?: string;
    detail?: string;
    next?: SuccessNext;
    doneLabel?: string;
  };
  /* Unknown deep links land here. */
  NotFound: { path?: string } | undefined;
  /* A link or tap to something this role can't open. */
  NoAccess: { what?: string } | undefined;
};

/* Where the Success page's main button goes (a stack screen or a tab). */
export type SuccessNext = { label: string; screen: string; params?: object };

export type RootScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<RootStackParamList, T>;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
