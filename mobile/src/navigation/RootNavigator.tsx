import React, { useMemo } from "react";
import { DarkTheme, DefaultTheme, NavigationContainer, type Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthProvider";
import { canMarkAttendance, canUseLeads, canUseTasks } from "../lib/roles";
import { useTheme } from "../theme/ThemeProvider";
import { font } from "../theme/tokens";
import { Icon, type IconName } from "../ui";
import { LoginScreen } from "../screens/auth/LoginScreen";
import { HomeScreen } from "../screens/home/HomeScreen";
import { AttendanceScreen } from "../screens/attendance/AttendanceScreen";
import { LeaveScreen } from "../screens/attendance/LeaveScreen";
import { AddPropertyScreen } from "../screens/inventory/AddPropertyScreen";
import { InventoryScreen } from "../screens/inventory/InventoryScreen";
import { PropertyDetailScreen } from "../screens/inventory/PropertyDetailScreen";
import { ApprovalsScreen } from "../screens/approvals/ApprovalsScreen";
import { ChatsScreen } from "../screens/chat/ChatsScreen";
import { ConversationScreen } from "../screens/chat/ConversationScreen";
import { NewChatScreen } from "../screens/chat/NewChatScreen";
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
import { NewTaskScreen } from "../screens/tasks/NewTaskScreen";
import { TaskDetailScreen } from "../screens/tasks/TaskDetailScreen";
import { TasksScreen } from "../screens/tasks/TasksScreen";
import { PersonTasksScreen } from "../screens/tasks/PersonTasksScreen";
import { TeamWorkloadScreen } from "../screens/tasks/TeamWorkloadScreen";
import { linking } from "./linking";
import type { RootStackParamList, TabParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<TabParamList>();

const TAB_ICONS: Record<keyof TabParamList, [IconName, IconName]> = {
  Home: ["home", "home-outline"],
  Leads: ["people", "people-outline"],
  Tasks: ["checkbox", "checkbox-outline"],
  Attendance: ["finger-print", "finger-print-outline"],
  More: ["grid", "grid-outline"],
};


const Tabs = () => {
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const role = user?.role;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textFaint,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 64 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 8,
        },
        tabBarItemStyle: { height: 50 },
        tabBarLabelStyle: { fontFamily: font.medium, fontSize: 11, lineHeight: 16 },
        tabBarIcon: ({ focused, color, size }) => (
          <Icon name={TAB_ICONS[route.name][focused ? 0 : 1]} color={color} size={size - 2} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      {canUseLeads(role) ? <Tab.Screen name="Leads" component={LeadsScreen} /> : null}
      {canUseTasks(role) ? <Tab.Screen name="Tasks" component={TasksScreen} /> : null}
      {canMarkAttendance(role) ? <Tab.Screen name="Attendance" component={AttendanceScreen} /> : null}
      <Tab.Screen name="More" component={MoreScreen} />
    </Tab.Navigator>
  );
};

export const RootNavigator = () => {
  const { user } = useAuth();
  const { colors, scheme } = useTheme();

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
          headerTintColor: colors.primary,
          headerTitleStyle: { fontFamily: font.semibold, color: colors.text },
          headerStyle: { backgroundColor: colors.surface },
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        {user ? (
          <>
            <Stack.Screen name="Tabs" component={Tabs} options={{ headerShown: false }} />
            <Stack.Screen name="LeadDetail" component={LeadDetailScreen} options={{ title: "Lead" }} />
            <Stack.Screen name="UpdateLead" component={UpdateLeadScreen} options={{ title: "Update lead", presentation: "modal" }} />
            <Stack.Screen name="AddLead" component={AddLeadScreen} options={{ title: "New lead", presentation: "modal" }} />
            <Stack.Screen name="TaskDetail" component={TaskDetailScreen} options={{ title: "Task" }} />
            <Stack.Screen name="NewTask" component={NewTaskScreen} options={{ title: "New task", presentation: "modal" }} />
            <Stack.Screen name="Leave" component={LeaveScreen} options={{ title: "Leave" }} />
            <Stack.Screen name="EditLead" component={EditLeadScreen} options={{ title: "Edit lead", presentation: "modal" }} />
            <Stack.Screen name="EditRequirements" component={EditRequirementsScreen} options={{ title: "Requirements", presentation: "modal" }} />
            <Stack.Screen name="TransferLead" component={TransferLeadScreen} options={{ title: "Transfer lead", presentation: "modal" }} />
            <Stack.Screen name="PickProperty" component={PickPropertyScreen} options={{ title: "Link a property", presentation: "modal" }} />
            <Stack.Screen name="Approvals" component={ApprovalsScreen} options={{ title: "Approvals" }} />
            <Stack.Screen name="TeamWorkload" component={TeamWorkloadScreen} options={{ title: "Team workload" }} />
            <Stack.Screen name="PersonTasks" component={PersonTasksScreen} options={{ title: "Tasks" }} />
            <Stack.Screen name="BulkUpload" component={BulkUploadScreen} options={{ title: "Bulk upload", presentation: "modal" }} />
            <Stack.Screen name="TeamPipeline" component={TeamPipelineScreen} options={{ title: "Team pipeline" }} />
            <Stack.Screen name="PersonLeads" component={PersonLeadsScreen} options={{ title: "Leads" }} />
            <Stack.Screen name="Chats" component={ChatsScreen} options={{ title: "Chats" }} />
            <Stack.Screen name="Conversation" component={ConversationScreen} options={{ title: "Chat" }} />
            <Stack.Screen name="NewChat" component={NewChatScreen} options={{ title: "New chat", presentation: "modal" }} />
            <Stack.Screen name="Schedule" component={ScheduleScreen} options={{ title: "Schedule" }} />
            <Stack.Screen name="Inventory" component={InventoryScreen} options={{ title: "Inventory" }} />
            <Stack.Screen name="PropertyDetail" component={PropertyDetailScreen} options={{ title: "Property" }} />
            <Stack.Screen name="AddProperty" component={AddPropertyScreen} options={{ title: "New property", presentation: "modal" }} />
            <Stack.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};
