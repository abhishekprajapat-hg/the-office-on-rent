export type UserRole =
  | "ADMIN"
  | "MANAGER"
  | "INSIDE_EXECUTIVE"
  | "EXECUTIVE"
  | "FIELD_EXECUTIVE"
  | "PRODUCTION_EXECUTIVE"
  | "COMMUNITY_MANAGER"
  | "CHANNEL_PARTNER"
  | "COWORKING_ADMIN";

export type User = {
  id: string;
  _id?: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  profileImageUrl?: string;
  companyId?: string;
  parentId?: string | null;
  canViewInventory?: boolean;
};

export type Tenant = { id: string; name: string; subdomain?: string } | null;

export type AuthResponse = {
  token?: string;
  accessToken?: string;
  refreshToken?: string;
  user: User;
  tenant?: Tenant;
};

export type PersonRef = { _id: string; name: string; role?: string; phone?: string; email?: string; profileImageUrl?: string } | null;

export type LeadTemperature = "COLD" | "WARM" | "HOT" | "";

export type Lead = {
  _id: string;
  name: string;
  phone: string;
  email?: string;
  city?: string;
  company?: string;
  projectInterested?: string;
  status: string;
  source?: "META" | "MANUAL";
  sourceChannel?: string;
  temperature?: LeadTemperature;
  hotClient?: boolean;
  nextFollowUp?: string | null;
  followUpPurpose?: string;
  lastContactedAt?: string | null;
  assignedTo?: PersonRef;
  assignedExecutive?: PersonRef;
  assignedManager?: PersonRef;
  assignedFieldExecutive?: PersonRef;
  createdBy?: PersonRef;
  createdAt?: string;
  updatedAt?: string;
};

export type Pagination = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
};

export type LeadSummary = {
  total: number;
  open: number;
  closed: number;
  lost: number;
  byStatus: Record<string, number>;
  pendingFirstCalls: number;
  followUpsDue: number;
  followUpsToday: number;
  overdueFollowUps: number;
};

export type Subtask = { _id?: string; title: string; isCompleted: boolean; status?: string; priority?: string; dueDate?: string | null; description?: string; assignedTo?: PersonRef | string | null };

export type TaskFile = { _id?: string; url: string; name?: string; mimeType?: string; size?: number; uploadedBy?: { _id: string; name: string } | string | null; uploadedAt?: string };

export type TaskComment = { _id: string; author?: { _id: string; name: string; profileImageUrl?: string } | null; body?: string; attachments?: TaskFile[]; createdAt?: string };

export type TaskActivity = { _id?: string; action: string; actor?: { _id: string; name: string } | null; detail?: string; message?: string; at?: string; createdAt?: string };

export type Task = {
  _id: string;
  title: string;
  description?: string;
  status: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | string;
  dueDate?: string | null;
  assignedTo?: PersonRef;
  createdBy?: PersonRef | string;
  leadId?: { _id: string; name: string; phone?: string } | string | null;
  subtasks?: Subtask[];
  tags?: string[];
  attachments?: TaskFile[];
  comments?: TaskComment[];
  activity?: TaskActivity[];
  createdAt?: string;
};

export type BreakSession = {
  _id?: string;
  startAt?: string | null;
  endAt?: string | null;
  durationMinutes?: number | null;
  breakType?: string;
};

export type AttendanceDay = {
  _id?: string;
  attendanceDate?: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  workedMinutes?: number | null;
  totalBreakMinutes?: number | null;
  breakSessions?: BreakSession[];
  isOnBreak?: boolean;
  activeBreakStartedAt?: string | null;
  isLateCheckIn?: boolean;
  /* PRESENT, LATE, HALF_DAY, ABSENT, ON_LEAVE, WEEK_OFF... - server-derived. */
  status?: string;
};
