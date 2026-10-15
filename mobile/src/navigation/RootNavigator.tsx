import React, { useMemo } from "react";
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator, type BottomTabHeaderProps } from "@react-navigation/bottom-tabs";
import { useAuth } from "../auth/AuthProvider";
import { canDoPageAction, canManagePage, canOpenPage } from "../api/access";
import { canMarkAttendance, isManagement } from "../lib/roles";
import { useTheme } from "../theme/ThemeProvider";
import { font } from "../theme/tokens";
import { AppHeader } from "../ui/AppHeader";
import { TabHeader } from "../ui/TabHeader";
import { GlassTabBar } from "./GlassTabBar";
import { homeKindFor, tabsShown } from "../lib/roleHome";
import { clearTabBadges } from "../lib/tabBadges";
import { SearchScreen } from "../screens/search/SearchScreen";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { HomeScreen } from "../screens/home/HomeScreen";
import { AttendanceScreen } from "../screens/attendance/AttendanceScreen";
import { LeaveScreen } from "../screens/attendance/LeaveScreen";
import { AttendanceHistoryScreen } from "../screens/attendance/AttendanceHistoryScreen";
import { TeamAttendanceScreen } from "../screens/attendance/TeamAttendanceScreen";
import { MemberAttendanceScreen } from "../screens/attendance/MemberAttendanceScreen";
import { OfficesScreen } from "../screens/attendance/OfficesScreen";
import { SalaryScreen } from "../screens/salary/SalaryScreen";
import { TeamSalaryScreen } from "../screens/salary/TeamSalaryScreen";
import { MemberSalaryScreen } from "../screens/salary/MemberSalaryScreen";
import { PayrollPolicyScreen } from "../screens/salary/PayrollPolicyScreen";
import { RevenueScreen } from "../screens/finance/RevenueScreen";
import { LeadPoolScreen } from "../screens/leads/LeadPoolScreen";
import { ContactsScreen } from "../screens/contacts/ContactsScreen";
import { ProjectsScreen } from "../screens/projects/ProjectsScreen";
import { ProjectDetailScreen } from "../screens/projects/ProjectDetailScreen";
import { ProjectFormScreen } from "../screens/projects/ProjectFormScreen";
import { PropertyActivityScreen } from "../screens/inventory/PropertyActivityScreen";
import { MyRequestsScreen } from "../screens/inventory/MyRequestsScreen";
import { FinanceScreen } from "../screens/finance/FinanceScreen";
import { RecordPaymentScreen } from "../screens/finance/RecordPaymentScreen";
import { ReportsScreen } from "../screens/reports/ReportsScreen";
import { LeaderboardScreen } from "../screens/leaderboard/LeaderboardScreen";
import { TargetsScreen } from "../screens/leaderboard/TargetsScreen";
import { FieldOpsScreen } from "../screens/field/FieldOpsScreen";
import { MemberPerformanceScreen, PerformanceScreen } from "../screens/performance/PerformanceScreen";
import { RolesScreen } from "../screens/admin/RolesScreen";
import { AddPropertyScreen } from "../screens/inventory/AddPropertyScreen";
import { InventoryScreen } from "../screens/inventory/InventoryScreen";
import { PropertyDetailScreen } from "../screens/inventory/PropertyDetailScreen";
import { ApprovalsScreen } from "../screens/approvals/ApprovalsScreen";
import { ChatsScreen } from "../screens/chat/ChatsScreen";
import { ConversationScreen } from "../screens/chat/ConversationScreen";
import { NewChatScreen } from "../screens/chat/NewChatScreen";
import { BroadcastScreen } from "../screens/chat/BroadcastScreen";
import { BookingsScreen } from "../screens/coworking/BookingsScreen";
import { NewBookingScreen } from "../screens/coworking/NewBookingScreen";
import { ClientsScreen } from "../screens/coworking/ClientsScreen";
import { ClientDetailScreen } from "../screens/coworking/ClientDetailScreen";
import { AddClientScreen } from "../screens/coworking/AddClientScreen";
import { AdminConsoleScreen } from "../screens/admin/AdminConsoleScreen";
import { UsersScreen } from "../screens/admin/UsersScreen";
import { UserDetailScreen } from "../screens/admin/UserDetailScreen";
import { AddUserScreen } from "../screens/admin/AddUserScreen";
import { MetaAdsScreen } from "../screens/admin/MetaAdsScreen";
import { SystemSettingsScreen } from "../screens/admin/SystemSettingsScreen";
import { ScheduleScreen } from "../screens/schedule/ScheduleScreen";
import { EditLeadScreen } from "../screens/leads/EditLeadScreen";
import { EditRequirementsScreen } from "../screens/leads/EditRequirementsScreen";
import { PickPropertyScreen } from "../screens/leads/PickPropertyScreen";
import { TransferLeadScreen } from "../screens/leads/TransferLeadScreen";
import { BulkUploadScreen } from "../screens/leads/BulkUploadScreen";
import { PersonLeadsScreen } from "../screens/leads/PersonLeadsScreen";
import { TeamPipelineScreen } from "../screens/leads/TeamPipelineScreen";
import { AddLeadScreen } from "../screens/leads/AddLeadScreen";
import { LeadDetailScreen } from "../screens/leads/LeadDetailScreen";
import { LeadsScreen } from "../screens/leads/LeadsScreen";
import { UpdateLeadScreen } from "../screens/leads/UpdateLeadScreen";
import { MoreScreen } from "../screens/more/MoreScreen";
import { ProfileScreen } from "../screens/more/ProfileScreen";
import { SettingsScreen } from "../screens/more/SettingsScreen";
import { NotificationsScreen } from "../screens/notifications/NotificationsScreen";
import { NewTaskScreen } from "../screens/tasks/NewTaskScreen";
import { TaskDetailScreen } from "../screens/tasks/TaskDetailScreen";
import { TasksScreen } from "../screens/tasks/TasksScreen";
import { PersonTasksScreen } from "../screens/tasks/PersonTasksScreen";
import { TeamWorkloadScreen } from "../screens/tasks/TeamWorkloadScreen";
import { linking } from "./linking";
import type { RootStackParamList, TabParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

/* Screens that also live in a role's tab bar (Home by Role). */
const TeamTab = (props: object) => {
  const { user } = useAuth();
  return user?.role === "ADMIN" ? <UsersScreen {...(props as React.ComponentProps<typeof UsersScreen>)} /> : <TeamWorkloadScreen {...(props as React.ComponentProps<typeof TeamWorkloadScreen>)} />;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asTab = (Screen: React.ComponentType<any>) => (props: object) => <Screen {...props} />;
const ApprovalsTab = asTab(ApprovalsScreen);
const VisitsTab = asTab(FieldOpsScreen);
const BookingsTab = asTab(BookingsScreen);
const ClientsTab = asTab(ClientsScreen);
const ListingsTab = asTab(InventoryScreen);

const Tabs = () => {
  const { user, access } = useAuth();
  const role = user?.role;
  const kind = homeKindFor(role);
  const shown = tabsShown(kind, user, access);
  const allowed = (page: string) => canOpenPage(user, access, page);
  React.useEffect(() => {
    clearTabBadges();
  }, [user?.id, user?._id]);
  const withHeader = { headerShown: true, header: (props: BottomTabHeaderProps) => <TabHeader {...props} /> };

  return (
    <Tab.Navigator backBehavior="history" tabBar={(props) => <GlassTabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tab.Screen name="Home" component={HomeScreen} />
      {allowed("leads") || allowed("my_leads") ? <Tab.Screen name="Leads" component={LeadsScreen} /> : null}
      {allowed("tasks") ? <Tab.Screen name="Tasks" component={TasksScreen} /> : null}
      {shown.has("TeamTab") ? <Tab.Screen name="TeamTab" component={TeamTab} options={{ ...withHeader, title: "Team" }} /> : null}
      {shown.has("ApprovalsTab") ? <Tab.Screen name="ApprovalsTab" component={ApprovalsTab} options={{ ...withHeader, title: "Approvals" }} /> : null}
      {shown.has("VisitsTab") ? <Tab.Screen name="VisitsTab" component={VisitsTab} /> : null}
      {shown.has("BookingsTab") ? <Tab.Screen name="BookingsTab" component={BookingsTab} options={{ ...withHeader, title: "Bookings" }} /> : null}
      {shown.has("ClientsTab") ? <Tab.Screen name="ClientsTab" component={ClientsTab} options={{ ...withHeader, title: "Clients" }} /> : null}
      {shown.has("ListingsTab") ? <Tab.Screen name="ListingsTab" component={ListingsTab} /> : null}
      {allowed("attendance") && canMarkAttendance(role) ? <Tab.Screen name="Attendance" component={AttendanceScreen} /> : null}
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
};

export const RootNavigator = () => {
  const { user, access } = useAuth();
  const { colors, scheme } = useTheme();
  const allowed = (page: string) => canOpenPage(user, access, page);
  const action = (page: string, name: string) => canDoPageAction(user, access, page, name);
  const leads = allowed("leads") || allowed("my_leads");

  const navTheme = useMemo<Theme>(() => {
    const base = scheme === "dark" ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [colors, scheme]);

  return (
    <NavigationContainer theme={navTheme} linking={linking}>
      <Stack.Navigator
        screenOptions={{
          header: (props) => <AppHeader {...props} />,
          headerTintColor: colors.primary,
          headerTitleStyle: { fontFamily: font.bold, fontSize: 16, color: colors.text },
          headerTitleAlign: "center",
          headerStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            {leads ? <Stack.Screen name="LeadDetail" component={LeadDetailScreen} options={{ title: "Lead" }} /> : null}
            {action("leads", "edit") || action("my_leads", "edit") ? <Stack.Screen name="UpdateLead" component={UpdateLeadScreen} options={{ title: "Update status", presentation: "transparentModal", headerShown: false, animation: "fade" }} /> : null}
            {action("leads", "create") || action("my_leads", "create") ? <Stack.Screen name="AddLead" component={AddLeadScreen} options={{ title: "New lead", presentation: "modal" }} /> : null}
            {allowed("tasks") ? <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: "Task" }} /> : null}
            {action("tasks", "create") ? <Stack.Screen name="NewTask" component={NewTaskScreen} options={{ title: "New task", presentation: "modal" }} /> : null}
            {allowed("attendance") ? <Stack.Screen name="Leave" component={LeaveScreen} options={{ title: "Leave" }} /> : null}
            {action("leads", "edit") || action("my_leads", "edit") ? <Stack.Screen name="EditLead" component={EditLeadScreen} options={{ title: "Edit lead", presentation: "modal" }} /> : null}
            {action("leads", "edit") || action("my_leads", "edit") ? <Stack.Screen name="EditRequirements" component={EditRequirementsScreen} options={{ title: "Requirements", presentation: "modal" }} /> : null}
            {action("leads", "assign") ? <Stack.Screen name="TransferLead" component={TransferLeadScreen} options={{ title: "Transfer lead", presentation: "transparentModal", headerShown: false, animation: "fade" }} /> : null}
            {leads && allowed("inventory") ? <Stack.Screen name="PickProperty" component={PickPropertyScreen} options={{ title: "Link a property", presentation: "modal" }} /> : null}
            {allowed("admin_console") ? <Stack.Screen name="Approvals" component={ApprovalsScreen} options={{ title: "Approvals" }} /> : null}
            {allowed("tasks") && isManagement(user.role) ? <Stack.Screen name="TeamWorkload" component={TeamWorkloadScreen} options={{ title: "Team workload" }} /> : null}
            {allowed("tasks") && isManagement(user.role) ? <Stack.Screen name="PersonTasks" component={PersonTasksScreen} options={{ title: "Tasks" }} /> : null}
            {action("leads", "create") || action("my_leads", "create") ? <Stack.Screen name="BulkUpload" component={BulkUploadScreen} options={{ title: "Bulk upload", presentation: "modal" }} /> : null}
            {allowed("leads") && isManagement(user.role) ? <Stack.Screen name="TeamPipeline" component={TeamPipelineScreen} options={{ title: "Team pipeline" }} /> : null}
            {allowed("leads") && isManagement(user.role) ? <Stack.Screen name="PersonLeads" component={PersonLeadsScreen} options={{ title: "Leads" }} /> : null}
            {allowed("chat") ? <Stack.Screen name="Chats" component={ChatsScreen} options={{ title: "Chats", headerShown: false }} /> : null}
            {allowed("chat") ? <Stack.Screen name="Conversation" component={ConversationScreen} options={{ title: "Chat", headerShown: false }} /> : null}
            {action("chat", "create") && isManagement(user.role) ? <Stack.Screen name="Broadcast" component={BroadcastScreen} options={{ title: "Broadcast" }} /> : null}
            {action("chat", "create") ? <Stack.Screen name="NewChat" component={NewChatScreen} options={{ title: "New chat", presentation: "modal" }} /> : null}
            {allowed("calendar") ? <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ title: "Schedule", headerShown: false }} /> : null}
            {allowed("inventory") ? <Stack.Screen name="Inventory" component={InventoryScreen} options={{ title: "Inventory", headerShown: false }} /> : null}
            {allowed("inventory") ? <Stack.Screen name="PropertyDetail" component={PropertyDetailScreen} options={{ title: "Property", headerShown: false }} /> : null}
            {action("inventory", "create") || action("inventory", "edit") ? <Stack.Screen name="AddProperty" component={AddPropertyScreen} options={{ title: "New property", presentation: "modal", headerShown: false }} /> : null}
            {allowed("inventory") ? <Stack.Screen name="PropertyActivity" component={PropertyActivityScreen} options={{ title: "Activity" }} /> : null}
            <Stack.Screen name="MyRequests" component={MyRequestsScreen} options={{ title: "My requests" }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
            <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: "Notifications" }} />
            <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
            {allowed("coworking_booking") ? <Stack.Screen name="Bookings" component={BookingsScreen} options={{ title: "Bookings" }} /> : null}
            {action("coworking_booking", "create") ? <Stack.Screen name="NewBooking" component={NewBookingScreen} options={{ title: "New booking", presentation: "modal" }} /> : null}
            {allowed("coworking_clients") ? <Stack.Screen name="Clients" component={ClientsScreen} options={{ title: "Clients" }} /> : null}
            {allowed("coworking_clients") ? <Stack.Screen name="ClientDetail" component={ClientDetailScreen} options={{ title: "Client" }} /> : null}
            {action("coworking_clients", "create") ? <Stack.Screen name="AddClient" component={AddClientScreen} options={{ title: "New client", presentation: "modal" }} /> : null}
            {isManagement(user.role) ? <Stack.Screen name="Search" component={SearchScreen} options={{ title: "Search" }} /> : null}
            {allowed("admin_console") ? <Stack.Screen name="AdminConsole" component={AdminConsoleScreen} options={{ title: "Admin", headerShown: false }} /> : null}
            {allowed("admin_team") ? <Stack.Screen name="Users" component={UsersScreen} options={{ title: "Users" }} /> : null}
            {allowed("admin_team") ? <Stack.Screen name="UserDetail" component={UserDetailScreen} options={{ title: "User" }} /> : null}
            {action("admin_team", "create") ? <Stack.Screen name="AddUser" component={AddUserScreen} options={{ title: "New user", presentation: "modal" }} /> : null}
            {allowed("admin_team") && isManagement(user.role) ? <Stack.Screen name="Roles" component={RolesScreen} options={{ title: "Roles" }} /> : null}
            {allowed("admin_meta_ads") ? <Stack.Screen name="MetaAds" component={MetaAdsScreen} options={{ title: "Meta Ads" }} /> : null}
            {allowed("settings") ? <Stack.Screen name="SystemSettings" component={SystemSettingsScreen} options={{ title: "System" }} /> : null}
            {allowed("salary") ? <Stack.Screen name="Salary" component={SalaryScreen} options={{ title: "Salary" }} /> : null}
            {allowed("salary") && isManagement(user.role) ? <Stack.Screen name="TeamSalary" component={TeamSalaryScreen} options={{ title: "Team salaries" }} /> : null}
            {allowed("salary") && isManagement(user.role) ? <Stack.Screen name="MemberSalary" component={MemberSalaryScreen} options={{ title: "Salary" }} /> : null}
            {allowed("salary") && isManagement(user.role) ? <Stack.Screen name="PayrollPolicy" component={PayrollPolicyScreen} options={{ title: "Deduction rules" }} /> : null}
            {allowed("performance") ? <Stack.Screen name="Performance" component={PerformanceScreen} options={{ title: "My performance" }} /> : null}
            {allowed("performance") && isManagement(user.role) ? <Stack.Screen name="MemberPerformance" component={MemberPerformanceScreen} options={{ title: "Performance" }} /> : null}
            {allowed("attendance") ? <Stack.Screen name="AttendanceHistory" component={AttendanceHistoryScreen} options={{ title: "History" }} /> : null}
            {allowed("attendance") && isManagement(user.role) ? <Stack.Screen name="TeamAttendance" component={TeamAttendanceScreen} options={{ title: "Team attendance" }} /> : null}
            {allowed("attendance") && isManagement(user.role) ? <Stack.Screen name="MemberAttendance" component={MemberAttendanceScreen} options={{ title: "Attendance" }} /> : null}
            {allowed("attendance") && isManagement(user.role) ? <Stack.Screen name="Offices" component={OfficesScreen} options={{ title: "Offices" }} /> : null}
            {allowed("leads") && isManagement(user.role) ? <Stack.Screen name="LeadPool" component={LeadPoolScreen} options={{ title: "Lead pool" }} /> : null}
            {allowed("inventory") && user.role !== "CHANNEL_PARTNER" ? <Stack.Screen name="Contacts" component={ContactsScreen} options={{ title: "Contacts database" }} /> : null}
            {allowed("projects") ? <Stack.Screen name="Projects" component={ProjectsScreen} options={{ title: "Projects" }} /> : null}
            {allowed("projects") ? <Stack.Screen name="ProjectDetail" component={ProjectDetailScreen} options={{ title: "Project" }} /> : null}
            {allowed("projects") && (canManagePage(user, access, "projects", "create") || canManagePage(user, access, "projects", "edit")) ? (
              <Stack.Screen name="ProjectForm" component={ProjectFormScreen} options={{ title: "Project", presentation: "modal" }} />
            ) : null}
            {allowed("finance") ? <Stack.Screen name="Finance" component={FinanceScreen} options={{ title: "Finance" }} /> : null}
            {allowed("finance") ? <Stack.Screen name="Revenue" component={RevenueScreen} options={{ title: "Revenue" }} /> : null}
            {allowed("reports") ? <Stack.Screen name="Reports" component={ReportsScreen} options={{ title: "Reports" }} /> : null}
            {allowed("leaderboard") ? <Stack.Screen name="Leaderboard" component={LeaderboardScreen} options={{ headerShown: false }} /> : null}
            {allowed("targets") ? <Stack.Screen name="Targets" component={TargetsScreen} options={{ title: "Targets" }} /> : null}
            {allowed("field_ops") ? <Stack.Screen name="FieldOps" component={FieldOpsScreen} options={{ headerShown: false }} /> : null}
            {action("finance", "create") ? <Stack.Screen name="RecordPayment" component={RecordPaymentScreen} options={{ title: "Record payment", presentation: "modal" }} /> : null}
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
