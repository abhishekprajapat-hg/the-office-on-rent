import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion as Motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  CheckSquare,
  ListTodo,
  Calendar,
  User,
  UserPlus,
  Link as LinkIcon,
  AlertCircle,
  Clock,
  SlidersHorizontal,
  X,
  Search,
  ArrowRight,
  ChevronRight,
  KanbanSquare,
  List
} from "lucide-react";
import {
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  getTaskStats
} from "../../services/taskService";
import { getUsers } from "../../services/userService";
import { getAllLeads } from "../../services/leadService";
import ToastNotice from "../../components/ui/ToastNotice";

const STATUS_COLUMNS = [
  { id: "BACKLOG", label: "Backlog", color: "text-slate-400 border-slate-400 bg-slate-400/5" },
  { id: "TODO", label: "To Do", color: "text-sky-400 border-sky-400 bg-sky-400/5" },
  { id: "IN_PROGRESS", label: "In Progress", color: "text-amber-400 border-amber-400 bg-amber-400/5" },
  { id: "COMPLETED", label: "Completed", color: "text-emerald-400 border-emerald-400 bg-emerald-400/5" }
];

const PRIORITIES = [
  { value: "LOW", label: "Low", color: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
  { value: "MEDIUM", label: "Medium", color: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  { value: "HIGH", label: "High", color: "bg-rose-500/10 text-rose-400 border-rose-500/20" }
];

export default function TaskManager({ theme = "light" }) {
  const isDark = theme === "dark";
  const currentRole = String(localStorage.getItem("role") || "").trim().toUpperCase();
  const isProductionExecutive = currentRole === "PRODUCTION_EXECUTIVE";

  // State
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({
    TODO: 0, IN_PROGRESS: 0, COMPLETED: 0, BACKLOG: 0,
    total: 0, pending: 0, overdue: 0, LOW: 0, MEDIUM: 0, HIGH: 0
  });
  const [teamUsers, setTeamUsers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [viewMode, setViewMode] = useState("kanban"); // kanban or list
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [leadFilter, setLeadFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");

  // Grouping & Sorting
  const [groupBy, setGroupBy] = useState("status"); // status, priority, assignee
  const [sortBy, setSortBy] = useState("createdNewest"); // createdNewest, dueDate, priority, title

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "TODO",
    priority: "MEDIUM",
    dueDate: "",
    assignedTo: "",
    leadId: "",
    subtasks: [],
    tags: []
  });
  const [submitting, setSubmitting] = useState(false);

  // Subtask & Tag inputs inside form
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [newTagInput, setNewTagInput] = useState("");

  // Drag states
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [activeDragCol, setActiveDragCol] = useState(null);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const filters = {};
      if (statusFilter) filters.status = statusFilter;
      if (priorityFilter) filters.priority = priorityFilter;
      if (assigneeFilter) filters.assignedTo = assigneeFilter;
      if (!isProductionExecutive && leadFilter) filters.leadId = leadFilter;
      if (searchQuery) filters.search = searchQuery;
      if (tagFilter) filters.tag = tagFilter;

      const [tasksData, statsData, usersData, leadsData] = await Promise.all([
        getTasks(filters),
        getTaskStats(),
        getUsers(),
        isProductionExecutive ? Promise.resolve([]) : getAllLeads()
      ]);

      setTasks(tasksData);
      if (statsData) setStats(statsData);
      if (usersData?.users) setTeamUsers(usersData.users.filter(u => u.isActive));
      if (leadsData) setLeads(leadsData);
    } catch (err) {
      console.error(err);
      setError("Failed to retrieve task details");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, priorityFilter, assigneeFilter, leadFilter, searchQuery, tagFilter, isProductionExecutive]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Flash Alerts auto-dismiss
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(""), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(""), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Form handling
  const handleOpenCreateModal = () => {
    setEditingTask(null);
    setFormData({
      title: "",
      description: "",
      status: "TODO",
      priority: "MEDIUM",
      dueDate: "",
      assignedTo: "",
      leadId: "",
      subtasks: [],
      tags: []
    });
    setNewSubtaskTitle("");
    setNewTagInput("");
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (task) => {
    setEditingTask(task);
    setFormData({
      title: task.title || "",
      description: task.description || "",
      status: task.status || "TODO",
      priority: task.priority || "MEDIUM",
      dueDate: task.dueDate ? new Date(task.dueDate).toISOString().split("T")[0] : "",
      assignedTo: task.assignedTo?._id || task.assignedTo || "",
      leadId: task.leadId?._id || task.leadId || "",
      subtasks: task.subtasks || [],
      tags: task.tags || []
    });
    setNewSubtaskTitle("");
    setNewTagInput("");
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      setError("Title is required");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const payload = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        status: formData.status,
        priority: formData.priority,
        dueDate: formData.dueDate || null,
        assignedTo: formData.assignedTo || null,
        leadId: isProductionExecutive ? null : formData.leadId || null,
        subtasks: formData.subtasks,
        tags: formData.tags
      };

      if (editingTask) {
        const updated = await updateTask(editingTask._id, payload);
        if (updated) {
          setSuccess("Task updated successfully");
          setIsModalOpen(false);
          fetchData();
        }
      } else {
        const created = await createTask(payload);
        if (created) {
          setSuccess("Task created successfully");
          setIsModalOpen(false);
          fetchData();
        }
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to save task");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm("Are you sure you want to delete this task?")) return;

    try {
      await deleteTask(taskId);
      setSuccess("Task deleted successfully");
      fetchData();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Failed to delete task");
    }
  };

  const handleUpdateStatus = async (taskId, newStatus) => {
    try {
      const updated = await updateTask(taskId, { status: newStatus });
      if (updated) {
        setSuccess("Status updated");
        fetchData();
      }
    } catch (err) {
      console.error(err);
      setError("Failed to update status");
    }
  };

  // Drag and Drop (Native HTML5)
  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData("text/plain", taskId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, status) => {
    e.preventDefault();
    if (activeDragCol !== status) {
      setActiveDragCol(status);
    }
  };

  const handleDragLeave = () => {
    setActiveDragCol(null);
  };

  const handleDrop = async (e, columnValue) => {
    e.preventDefault();
    setActiveDragCol(null);
    const taskId = e.dataTransfer.getData("text/plain") || draggedTaskId;
    if (!taskId) return;

    const taskIndex = tasks.findIndex(t => String(t._id) === String(taskId));
    if (taskIndex === -1) return;

    let updatedField = {};
    let hasChanged = false;

    if (groupBy === "status") {
      if (tasks[taskIndex].status !== columnValue) {
        updatedField = { status: columnValue };
        hasChanged = true;
      }
    } else if (groupBy === "priority") {
      if (tasks[taskIndex].priority !== columnValue) {
        updatedField = { priority: columnValue };
        hasChanged = true;
      }
    } else if (groupBy === "assignee") {
      const newAssigneeId = columnValue === "unassigned" ? null : columnValue;
      const currentAssigneeId = tasks[taskIndex].assignedTo?._id || tasks[taskIndex].assignedTo || null;
      if (String(currentAssigneeId) !== String(newAssigneeId)) {
        updatedField = { assignedTo: newAssigneeId };
        hasChanged = true;
      }
    }

    if (!hasChanged) return;

    const previousTasks = [...tasks];
    const updatedTasks = [...tasks];
    let updatedTaskValue = { ...updatedTasks[taskIndex], ...updatedField };
    if (groupBy === "assignee") {
      if (columnValue === "unassigned") {
        updatedTaskValue.assignedTo = null;
      } else {
        const userObj = teamUsers.find(u => String(u._id) === String(columnValue));
        updatedTaskValue.assignedTo = userObj ? { _id: userObj._id, name: userObj.name, role: userObj.role } : null;
      }
    }
    updatedTasks[taskIndex] = updatedTaskValue;
    setTasks(updatedTasks);

    try {
      await updateTask(taskId, updatedField);
      setSuccess("Task updated successfully");
      const statsData = await getTaskStats();
      if (statsData) setStats(statsData);
      fetchData();
    } catch (err) {
      console.error(err);
      setTasks(previousTasks); // roll back
      setError("Failed to update task");
    } finally {
      setDraggedTaskId(null);
    }
  };

  // Subtasks checklist modifications in form
  const handleAddSubtask = () => {
    if (!newSubtaskTitle.trim()) return;
    setFormData(prev => ({
      ...prev,
      subtasks: [...(prev.subtasks || []), { title: newSubtaskTitle.trim(), isCompleted: false }]
    }));
    setNewSubtaskTitle("");
  };

  const handleRemoveSubtask = (index) => {
    setFormData(prev => ({
      ...prev,
      subtasks: (prev.subtasks || []).filter((_, i) => i !== index)
    }));
  };

  const handleToggleSubtaskInForm = (index) => {
    setFormData(prev => {
      const updatedSubtasks = [...(prev.subtasks || [])];
      if (updatedSubtasks[index]) {
        updatedSubtasks[index] = {
          ...updatedSubtasks[index],
          isCompleted: !updatedSubtasks[index].isCompleted
        };
      }
      return { ...prev, subtasks: updatedSubtasks };
    });
  };

  // Tags management in form
  const handleToggleTag = (tag) => {
    setFormData(prev => {
      const currentTags = prev.tags || [];
      const exists = currentTags.includes(tag);
      if (exists) {
        return { ...prev, tags: currentTags.filter(t => t !== tag) };
      } else {
        return { ...prev, tags: [...currentTags, tag] };
      }
    });
  };

  const handleAddCustomTag = () => {
    const cleanTag = newTagInput.trim();
    if (!cleanTag) return;
    setFormData(prev => {
      const currentTags = prev.tags || [];
      if (currentTags.includes(cleanTag)) return prev;
      return { ...prev, tags: [...currentTags, cleanTag] };
    });
    setNewTagInput("");
  };

  // Sorting & Grouping computing helpers
  const sortedTasks = useMemo(() => {
    let result = [...tasks];
    if (sortBy === "dueDate") {
      result.sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
    } else if (sortBy === "priority") {
      const priorityWeight = { HIGH: 3, MEDIUM: 2, LOW: 1 };
      result.sort((a, b) => (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0));
    } else if (sortBy === "title") {
      result.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === "createdNewest") {
      result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }
    return result;
  }, [tasks, sortBy]);

  const boardColumns = useMemo(() => {
    if (groupBy === "priority") {
      return [
        { id: "LOW", label: "Low Priority", color: "text-blue-400 border-blue-400 bg-blue-400/5" },
        { id: "MEDIUM", label: "Medium Priority", color: "text-amber-400 border-amber-400 bg-amber-400/5" },
        { id: "HIGH", label: "High Priority", color: "text-rose-400 border-rose-400 bg-rose-400/5" }
      ];
    }
    if (groupBy === "assignee") {
      const cols = [
        { id: "unassigned", label: "Unassigned", color: "text-slate-400 border-slate-400 bg-slate-400/5" }
      ];
      teamUsers.forEach(u => {
        cols.push({
          id: u._id,
          label: u.name,
          color: "text-sky-400 border-sky-400 bg-sky-400/5"
        });
      });
      return cols;
    }
    return STATUS_COLUMNS;
  }, [groupBy, teamUsers]);

  const getColumnTasks = useCallback((colId) => {
    let filtered = [];
    if (groupBy === "priority") {
      filtered = sortedTasks.filter(t => t.priority === colId);
    } else if (groupBy === "assignee") {
      filtered = sortedTasks.filter(t => {
        const assignedId = t.assignedTo?._id || t.assignedTo || null;
        if (colId === "unassigned") {
          return !assignedId;
        }
        return String(assignedId) === String(colId);
      });
    } else {
      // status
      filtered = sortedTasks.filter(t => t.status === colId);
    }
    return filtered;
  }, [groupBy, sortedTasks]);

  const getSubtasksProgress = (task) => {
    if (!task.subtasks || task.subtasks.length === 0) return null;
    const completed = task.subtasks.filter(s => s.isCompleted).length;
    const total = task.subtasks.length;
    const percent = Math.round((completed / total) * 100);
    return { completed, total, percent };
  };

  const TAG_COLORS = {
    "Call": "bg-blue-500/10 text-blue-400 border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400 dark:border-blue-500/20",
    "Meeting": "bg-purple-500/10 text-purple-400 border-purple-500/20 dark:bg-purple-500/10 dark:text-purple-400 dark:border-purple-500/20",
    "Document": "bg-slate-500/10 text-slate-400 border-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400 dark:border-slate-500/20",
    "Site Visit": "bg-orange-500/10 text-orange-400 border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400 dark:border-orange-500/20",
    "Urgent": "bg-rose-500/10 text-rose-400 border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20",
    "Follow-up": "bg-amber-500/10 text-amber-400 border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20",
  };

  // Helper formats
  const formatDate = (dateStr) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  };

  const isOverdue = (task) => {
    if (task.status === "COMPLETED" || !task.dueDate) return false;
    return new Date(task.dueDate) < new Date().setHours(0,0,0,0);
  };

  // Styles mapping
  const styles = useMemo(() => {
    const isDark = theme === "dark";
    return {
      card: isDark 
        ? "border border-white/5 bg-slate-900/60 backdrop-blur-xl shadow-lg"
        : "border border-slate-200 bg-white shadow-md",
      headerCard: isDark
        ? "border border-white/5 bg-slate-900/30 backdrop-blur-md"
        : "border border-slate-100 bg-slate-50",
      input: isDark
        ? "border-slate-800 bg-slate-950/80 text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
        : "border-slate-200 bg-white text-slate-700 placeholder:text-slate-400 focus:border-sky-500 focus:ring-1 focus:ring-sky-500",
      button: isDark
        ? "border-white/5 bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-950",
      primaryButton: isDark
        ? "bg-sky-600 hover:bg-sky-500 text-white shadow-sky-950/30 shadow-md"
        : "bg-slate-900 hover:bg-slate-800 text-white shadow-slate-300 shadow-md",
      text: isDark ? "text-slate-300" : "text-slate-600",
      title: isDark ? "text-slate-100" : "text-slate-800",
      label: isDark ? "text-slate-400" : "text-slate-500",
      column: isDark
        ? "bg-slate-950/40 border-white/5 shadow-inner"
        : "bg-slate-100/60 border-slate-200/80 shadow-sm"
    };
  }, [theme]);

  return (
    <div className={`flex flex-col h-full w-full overflow-hidden ${isDark ? "bg-slate-950" : "bg-slate-50/50"}`}>
      <ToastNotice message={success} type="success" />
      <ToastNotice message={error} type="error" />

      {/* Main Container */}
      <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col space-y-3 p-3 sm:space-y-4 sm:p-4 lg:p-6">
        
        {/* Header Summary Stats */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
          <div className={`flex items-center justify-between rounded-2xl p-3 sm:p-4 ${styles.card}`}>
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider ${styles.label}`}>Total Tasks</p>
              <h3 className={`mt-1 text-xl font-black sm:text-2xl ${styles.title}`}>{stats.total}</h3>
            </div>
            <div className={`p-2.5 rounded-xl ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-700"}`}>
              <ListTodo size={20} />
            </div>
          </div>
          <div className={`flex items-center justify-between rounded-2xl p-3 sm:p-4 ${styles.card}`}>
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider ${styles.label}`}>Pending</p>
              <h3 className={`mt-1 text-xl font-black sm:text-2xl ${isDark ? "text-amber-400" : "text-amber-600"}`}>{stats.pending}</h3>
            </div>
            <div className={`p-2.5 rounded-xl ${isDark ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"}`}>
              <Clock size={20} />
            </div>
          </div>
          <div className={`flex items-center justify-between rounded-2xl p-3 sm:p-4 ${styles.card}`}>
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider ${styles.label}`}>Completed</p>
              <h3 className={`mt-1 text-xl font-black sm:text-2xl ${isDark ? "text-emerald-400" : "text-emerald-600"}`}>{stats.COMPLETED}</h3>
            </div>
            <div className={`p-2.5 rounded-xl ${isDark ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
              <CheckSquare size={20} />
            </div>
          </div>
          <div className={`flex items-center justify-between rounded-2xl p-3 sm:p-4 ${styles.card}`}>
            <div>
              <p className={`text-xs font-bold uppercase tracking-wider ${styles.label}`}>Overdue</p>
              <h3 className={`mt-1 text-xl font-black sm:text-2xl ${isDark ? "text-rose-400" : "text-rose-600"}`}>{stats.overdue}</h3>
            </div>
            <div className={`p-2.5 rounded-xl ${isDark ? "bg-rose-500/10 text-rose-400" : "bg-rose-50 text-rose-600"}`}>
              <AlertCircle size={20} />
            </div>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className={`space-y-3 rounded-2xl p-3 sm:p-4 ${styles.card}`}>
          <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
            {/* Search */}
            <div className="relative flex-1">
              <Search className={`absolute left-3 top-2.5 h-4 w-4 ${styles.label}`} />
              <input
                type="text"
                placeholder="Search tasks by title or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full h-9 pl-9 pr-4 rounded-xl border text-sm ${styles.input}`}
              />
            </div>

            {/* Toggle View + Create button */}
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center">
              {/* Group By & Sort By */}
              <div className="grid grid-cols-2 gap-1.5 sm:mr-2 sm:flex sm:items-center">
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value)}
                  className={`h-10 rounded-xl border px-2 text-xs font-semibold sm:h-9 ${styles.input}`}
                  title="Group By"
                >
                  <option value="status">Group: Status</option>
                  <option value="priority">Group: Priority</option>
                  <option value="assignee">Group: Assignee</option>
                </select>

                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className={`h-10 rounded-xl border px-2 text-xs font-semibold sm:h-9 ${styles.input}`}
                  title="Sort By"
                >
                  <option value="createdNewest">Newest</option>
                  <option value="dueDate">Due Date</option>
                  <option value="priority">Priority</option>
                  <option value="title">Title (A-Z)</option>
                </select>
              </div>

              <div className={`grid grid-cols-2 rounded-xl border p-0.5 sm:flex sm:items-center ${isDark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-100"}`}>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={`p-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all ${
                    viewMode === "kanban"
                      ? isDark ? "bg-slate-800 text-white shadow" : "bg-white text-slate-950 shadow"
                      : "text-slate-400 hover:text-slate-300"
                  }`}
                  title="Board View"
                >
                  <KanbanSquare size={14} />
                  <span className="hidden sm:inline">Board</span>
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`p-1.5 rounded-lg flex items-center gap-1.5 text-xs font-semibold transition-all ${
                    viewMode === "list"
                      ? isDark ? "bg-slate-800 text-white shadow" : "bg-white text-slate-950 shadow"
                      : "text-slate-400 hover:text-slate-300"
                  }`}
                  title="List View"
                >
                  <List size={14} />
                  <span className="hidden sm:inline">List</span>
                </button>
              </div>

              <button
                onClick={handleOpenCreateModal}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold uppercase tracking-wider sm:h-9 ${styles.primaryButton}`}
              >
                <Plus size={14} />
                Create Task
              </button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="grid grid-cols-2 gap-2 border-t border-slate-800/10 pt-1 dark:border-white/5 sm:flex sm:flex-wrap sm:items-center">
            <div className={`flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider ${styles.label}`}>
              <SlidersHorizontal size={12} />
              Filters:
            </div>
            
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`h-10 rounded-lg border px-2 text-xs font-medium sm:h-8 ${styles.input}`}
            >
              <option value="">All Statuses</option>
              {STATUS_COLUMNS.map(col => (
                <option key={col.id} value={col.id}>{col.label}</option>
              ))}
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className={`h-10 rounded-lg border px-2 text-xs font-medium sm:h-8 ${styles.input}`}
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>

            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className={`h-10 rounded-lg border px-2 text-xs font-medium sm:h-8 ${styles.input} sm:max-w-[150px]`}
            >
              <option value="">All Assignees</option>
              {teamUsers.map(u => (
                <option key={u._id} value={u._id}>{u.name}</option>
              ))}
            </select>

            {!isProductionExecutive && (
              <select
                value={leadFilter}
                onChange={(e) => setLeadFilter(e.target.value)}
                className={`h-10 rounded-lg border px-2 text-xs font-medium sm:h-8 ${styles.input} sm:max-w-[150px]`}
              >
                <option value="">All Leads</option>
                {leads.map(l => (
                  <option key={l._id} value={l._id}>{l.name}</option>
                ))}
              </select>
            )}

            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className={`h-10 rounded-lg border px-2 text-xs font-medium sm:h-8 ${styles.input}`}
            >
              <option value="">All Tags</option>
              {["Call", "Meeting", "Document", "Site Visit", "Urgent", "Follow-up"].map(tagOpt => (
                <option key={tagOpt} value={tagOpt}>{tagOpt}</option>
              ))}
            </select>

            {(statusFilter || priorityFilter || assigneeFilter || (!isProductionExecutive && leadFilter) || searchQuery || tagFilter) && (
              <button
                onClick={() => {
                  setStatusFilter("");
                  setPriorityFilter("");
                  setAssigneeFilter("");
                  setLeadFilter("");
                  setSearchQuery("");
                  setTagFilter("");
                }}
                className={`h-10 rounded-lg border px-2.5 text-xs font-medium transition-colors sm:h-8 ${
                  isDark ? "border-slate-800 text-rose-400 hover:bg-rose-950/20" : "border-slate-200 text-rose-600 hover:bg-rose-50"
                }`}
              >
                Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-2 py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            <p className={`text-sm font-semibold ${styles.label}`}>Fetching tasks...</p>
          </div>
        ) : tasks.length === 0 ? (
          <div className={`flex-1 rounded-2xl border p-12 text-center flex flex-col items-center justify-center space-y-3 ${styles.card}`}>
            <ListTodo size={40} className={isDark ? "text-slate-700" : "text-slate-300"} />
            <div>
              <p className={`text-base font-bold ${styles.title}`}>No tasks found</p>
              <p className={`text-xs mt-1 max-w-sm mx-auto ${styles.label}`}>
                Try relaxing your search or filter queries, or create a brand new task.
              </p>
            </div>
            <button
              onClick={handleOpenCreateModal}
              className={`h-9 px-4 rounded-xl flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider ${styles.primaryButton}`}
            >
              <Plus size={14} />
              Create First Task
            </button>
          </div>
        ) : viewMode === "kanban" ? (
          /* ========================================================
             KANBAN BOARD VIEW (HTML5 Drag & Drop)
             ======================================================== */
          <div className="custom-scrollbar grid min-h-0 flex-1 grid-cols-1 gap-3 pb-4 sm:flex sm:gap-4 sm:overflow-x-auto">
            {boardColumns.map((col) => {
              const columnTasks = getColumnTasks(col.id);
              const isOver = activeDragCol === col.id;

              return (
                <div
                  key={col.id}
                  onDragOver={(e) => handleDragOver(e, col.id)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, col.id)}
                  className={`flex max-h-full w-full flex-col rounded-2xl border transition-all sm:w-[280px] sm:min-w-[280px] sm:shrink-0 ${styles.column} ${
                    isOver ? "ring-2 ring-sky-500/50 bg-sky-500/5 border-sky-400" : ""
                  }`}
                >
                  {/* Column Header */}
                  <div className="p-3 flex items-center justify-between border-b border-slate-800/10 dark:border-white/5">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block w-2.5 h-2.5 rounded-full border ${col.color ? col.color.split(" ")[0] : "text-sky-450"} ${col.color ? col.color.split(" ")[1] : "border-sky-450"}`} />
                      <span className={`text-sm font-bold tracking-tight ${styles.title}`}>{col.label}</span>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${isDark ? "bg-slate-900 text-slate-400" : "bg-slate-200 text-slate-600"}`}>
                      {columnTasks.length}
                    </span>
                  </div>

                  {/* Task Card List */}
                  <div className="custom-scrollbar min-h-[120px] flex-1 space-y-2.5 p-2 sm:overflow-y-auto">
                    <AnimatePresence initial={false}>
                      {columnTasks.map((task) => {
                        const priority = PRIORITIES.find(p => p.value === task.priority) || PRIORITIES[1];
                        const expired = isOverdue(task);
                        const progress = getSubtasksProgress(task);

                        return (
                          <Motion.div
                            key={task._id}
                            layoutId={task._id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, task._id)}
                            className={`rounded-xl p-3 border group/card relative cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${
                              isDark 
                                ? "bg-slate-900/90 border-slate-800/80 hover:border-slate-700/80" 
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.2 }}
                          >
                            {/* Priority & Quick Actions */}
                            <div className="flex items-center justify-between mb-2">
                              <span className={`text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${priority.color}`}>
                                {priority.label}
                              </span>
                              
                              <div className="opacity-0 group-hover/card:opacity-100 flex items-center gap-1 transition-opacity">
                                <button
                                  onClick={() => handleOpenEditModal(task)}
                                  className={`p-1 rounded hover:bg-slate-800/50 ${isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-800"}`}
                                  title="Edit Task"
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button
                                  onClick={() => handleDeleteTask(task._id)}
                                  className="p-1 rounded hover:bg-rose-950/20 text-rose-500 hover:text-rose-400"
                                  title="Delete Task"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            </div>

                            {/* Task Content */}
                            <h4 className={`text-xs font-semibold leading-snug break-words ${styles.title}`}>
                              {task.title}
                            </h4>

                            {/* Tags List */}
                            {task.tags && task.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5 mb-1">
                                {task.tags.map((t) => {
                                  const colorClass = TAG_COLORS[t] || "bg-sky-500/10 text-sky-400 border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20";
                                  return (
                                    <span 
                                      key={t} 
                                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${colorClass}`}
                                    >
                                      {t}
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            {task.description && (
                              <p className={`text-[11px] mt-1 line-clamp-2 break-words ${styles.label}`}>
                                {task.description}
                              </p>
                            )}

                            {/* Subtask progress bar */}
                            {progress && (
                              <div className="mt-2.5 space-y-1">
                                <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium">
                                  <span className="flex items-center gap-1">
                                    <CheckSquare size={9} />
                                    {progress.completed}/{progress.total} Subtasks
                                  </span>
                                  <span>{progress.percent}%</span>
                                </div>
                                <div className={`w-full h-1 rounded-full overflow-hidden ${isDark ? "bg-slate-800" : "bg-slate-200"}`}>
                                  <div 
                                    className="h-full bg-emerald-500 transition-all duration-300"
                                    style={{ width: `${progress.percent}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* Metadata (Lead, Assignee, Date) */}
                            <div className="mt-3 pt-2 border-t border-slate-800/10 dark:border-white/5 space-y-1.5 text-[10px]">
                              {/* Linked Lead */}
                              {!isProductionExecutive && task.leadId && (
                                <div className={`flex items-center gap-1 truncate ${styles.label}`}>
                                  <LinkIcon size={10} className="shrink-0" />
                                  <span className="truncate">Lead: {task.leadId.name}</span>
                                </div>
                              )}

                              {/* Dates */}
                              {task.dueDate && (
                                <div className={`flex items-center gap-1 ${
                                  expired ? "text-rose-500 font-bold" : styles.label
                                }`}>
                                  <Calendar size={10} className="shrink-0" />
                                  <span>{formatDate(task.dueDate)}</span>
                                  {expired && <span className="text-[9px] uppercase tracking-wider ml-1">Overdue</span>}
                                </div>
                              )}
                            </div>

                            {/* Assignee Avatar Indicator */}
                            <div className="mt-2.5 flex items-center justify-between">
                              <span className={`text-[9px] ${styles.label}`}>
                                By {task.createdBy?.name || "System"}
                              </span>
                              {task.assignedTo ? (
                                <div 
                                  className="h-5 w-5 rounded-full bg-sky-500 flex items-center justify-center text-[10px] text-white font-bold tracking-tight shadow-sm shrink-0 border border-slate-800 dark:border-slate-900"
                                  title={`Assigned to ${task.assignedTo.name}`}
                                >
                                  {task.assignedTo.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                                </div>
                              ) : (
                                <div 
                                  className="h-5 w-5 rounded-full border border-dashed border-slate-700/80 flex items-center justify-center text-slate-500 shrink-0"
                                  title="Unassigned"
                                >
                                  <User size={10} />
                                </div>
                              )}
                            </div>

                            {/* Kanban Quick Navigation */}
                            {groupBy === "status" && (
                              <div className="mt-2.5 pt-1.5 border-t border-slate-850 flex items-center justify-end gap-1.5 opacity-0 group-hover/card:opacity-100 transition-opacity">
                                {col.id !== "BACKLOG" && (
                                  <button
                                    onClick={() => handleUpdateStatus(task._id, STATUS_COLUMNS[STATUS_COLUMNS.findIndex(c => c.id === col.id) - 1].id)}
                                    className={`p-1 rounded text-[9px] font-semibold flex items-center gap-0.5 border ${styles.button}`}
                                  >
                                    Move Left
                                  </button>
                                )}
                                {col.id !== "COMPLETED" && (
                                  <button
                                    onClick={() => handleUpdateStatus(task._id, STATUS_COLUMNS[STATUS_COLUMNS.findIndex(c => c.id === col.id) + 1].id)}
                                    className={`p-1 rounded text-[9px] font-semibold flex items-center gap-0.5 border ${styles.button}`}
                                  >
                                    Move Right
                                  </button>
                                )}
                              </div>
                            )}
                          </Motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* ========================================================
             LIST / TABLE VIEW
             ======================================================== */
          <div className={`flex-1 rounded-2xl border ${styles.card}`}>
            <div className="space-y-2 p-2 sm:hidden">
              {sortedTasks.map((task) => {
                const priority = PRIORITIES.find(p => p.value === task.priority) || PRIORITIES[1];
                const expired = isOverdue(task);

                return (
                  <div
                    key={task._id}
                    className={`rounded-xl border p-3 ${isDark ? "border-slate-800 bg-slate-900/80" : "border-slate-200 bg-white"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className={`truncate text-sm font-bold ${styles.title}`}>{task.title}</h4>
                        {task.description && (
                          <p className={`mt-1 line-clamp-2 text-xs ${styles.label}`}>{task.description}</p>
                        )}
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${priority.color}`}>
                        {priority.label}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                      <div className={styles.label}>Status</div>
                      <select
                        value={task.status}
                        onChange={(e) => handleUpdateStatus(task._id, e.target.value)}
                        className={`h-9 rounded-lg border px-2 text-xs font-semibold ${styles.input}`}
                      >
                        {STATUS_COLUMNS.map(colOpt => (
                          <option key={colOpt.id} value={colOpt.id}>{colOpt.label}</option>
                        ))}
                      </select>
                      <div className={styles.label}>Due</div>
                      <div className={`font-semibold ${expired ? "text-rose-500" : styles.title}`}>
                        {task.dueDate ? formatDate(task.dueDate) : "-"}
                      </div>
                      {!isProductionExecutive && (
                        <>
                          <div className={styles.label}>Lead</div>
                          <div className={`truncate font-semibold ${styles.title}`}>
                            {task.leadId?.name || "-"}
                          </div>
                        </>
                      )}
                      <div className={styles.label}>Assignee</div>
                      <div className={`truncate font-semibold ${styles.title}`}>
                        {task.assignedTo?.name || "-"}
                      </div>
                    </div>

                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleOpenEditModal(task)}
                        className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${styles.button}`}
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task._id)}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-rose-500/20 text-rose-500 hover:bg-rose-500/10"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="custom-scrollbar hidden h-full overflow-y-auto sm:block">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className={`border-b border-slate-800/10 dark:border-white/5 text-xs font-bold uppercase tracking-wider ${
                    isDark ? "bg-slate-900/50 text-slate-400" : "bg-slate-50 text-slate-600"
                  }`}>
                    <th className="p-4">Title</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Priority</th>
                    <th className="p-4">Due Date</th>
                    {!isProductionExecutive && <th className="p-4">Linked Lead</th>}
                    <th className="p-4">Assignee</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? "divide-white/5" : "divide-slate-200"}`}>
                  {sortedTasks.map((task) => {
                    const priority = PRIORITIES.find(p => p.value === task.priority) || PRIORITIES[1];
                    const expired = isOverdue(task);
                    const progress = getSubtasksProgress(task);

                    return (
                      <tr 
                        key={task._id} 
                        className={`text-xs hover:bg-slate-500/5 transition-colors ${
                          isDark ? "text-slate-300" : "text-slate-700"
                        }`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold">{task.title}</span>
                            {progress && (
                              <span className="text-[10px] bg-slate-500/10 text-slate-400 border border-slate-500/20 px-1 rounded flex items-center gap-0.5" title={`${progress.completed}/${progress.total} Subtasks`}>
                                <CheckSquare size={9} />
                                {progress.completed}/{progress.total}
                              </span>
                            )}
                          </div>
                          {task.tags && task.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {task.tags.map(t => {
                                const colorClass = TAG_COLORS[t] || "bg-sky-500/10 text-sky-400 border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-400 dark:border-sky-500/20";
                                return (
                                  <span key={t} className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${colorClass}`}>
                                    {t}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {task.description && (
                            <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1 max-w-sm">{task.description}</div>
                          )}
                        </td>
                        <td className="p-4">
                          <select
                            value={task.status}
                            onChange={(e) => handleUpdateStatus(task._id, e.target.value)}
                            className={`h-7 rounded-md border text-[11px] font-semibold py-0.5 px-2 bg-transparent ${
                              isDark ? "border-slate-800 text-slate-300 bg-slate-950" : "border-slate-200 text-slate-700 bg-white"
                            }`}
                          >
                            {STATUS_COLUMNS.map(colOpt => (
                              <option key={colOpt.id} value={colOpt.id}>{colOpt.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-4">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${priority.color}`}>
                            {priority.label}
                          </span>
                        </td>
                        <td className={`p-4 ${expired ? "text-rose-500 font-bold" : ""}`}>
                          {task.dueDate ? formatDate(task.dueDate) : "-"}
                          {expired && <span className="text-[9px] uppercase font-bold tracking-wider ml-1 bg-rose-500/10 border border-rose-500/20 px-1 py-0.5 rounded">Overdue</span>}
                        </td>
                        {!isProductionExecutive && (
                          <td className="p-4">
                            {task.leadId ? (
                              <div className="flex items-center gap-1">
                                <LinkIcon size={10} className="text-slate-500" />
                                <span className="font-medium">{task.leadId.name}</span>
                              </div>
                            ) : (
                              <span className="text-slate-550 italic">-</span>
                            )}
                          </td>
                        )}
                        <td className="p-4">
                          {task.assignedTo ? (
                            <div className="flex items-center gap-1.5">
                              <div className="h-5 w-5 rounded-full bg-sky-500 flex items-center justify-center text-[9px] text-white font-bold shadow-sm">
                                {task.assignedTo.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <span className="font-medium">{task.assignedTo.name}</span>
                            </div>
                          ) : (
                            <span className="text-slate-550 italic">-</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenEditModal(task)}
                              className={`p-1.5 rounded-lg border ${styles.button}`}
                              title="Edit"
                            >
                              <Edit2 size={12} />
                            </button>
                            <button
                              onClick={() => handleDeleteTask(task._id)}
                              className={`p-1.5 rounded-lg border border-rose-500/20 text-rose-500 hover:bg-rose-500/10`}
                              title="Delete"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Task Creation / Edit Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="mobile-bottom-sheet fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4">
            {/* Backdrop */}
            <Motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />

            {/* Modal Box */}
            <Motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className={`mobile-fullscreen-panel relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-[22px] border p-4 sm:p-6 ${
                isDark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-white"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-base font-black uppercase tracking-wider ${styles.title}`}>
                  {editingTask ? "Edit Task Details" : "Create New Task"}
                </h3>
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className={`p-1 rounded-lg border ${styles.button}`}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="mobile-modal-scroll flex-1 space-y-4">
                {/* Title */}
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
                    Task Title *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="E.g. Call client for site feedback..."
                    value={formData.title}
                    onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                    className={`w-full h-10 px-3 rounded-xl border text-sm ${styles.input}`}
                  />
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
                    Description
                  </label>
                  <textarea
                    placeholder="Add detailed task notes, instructions, or goals..."
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    className={`w-full h-20 px-3 py-2 rounded-xl border text-sm resize-none ${styles.input}`}
                  />
                </div>

                {/* Status & Priority */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value }))}
                      className={`w-full h-10 px-3 rounded-xl border text-sm ${styles.input}`}
                    >
                      {STATUS_COLUMNS.map(col => (
                        <option key={col.id} value={col.id}>{col.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
                      Priority
                    </label>
                    <select
                      value={formData.priority}
                      onChange={(e) => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                      className={`w-full h-10 px-3 rounded-xl border text-sm ${styles.input}`}
                    >
                      {PRIORITIES.map(p => (
                        <option key={p.value} value={p.value}>{p.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Due Date & Assignee */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
                      Due Date
                    </label>
                    <input
                      type="date"
                      value={formData.dueDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, dueDate: e.target.value }))}
                      className={`w-full h-10 px-3 rounded-xl border text-sm ${styles.input}`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
                      Assignee
                    </label>
                    <select
                      value={formData.assignedTo}
                      onChange={(e) => setFormData(prev => ({ ...prev, assignedTo: e.target.value }))}
                      className={`w-full h-10 px-3 rounded-xl border text-sm ${styles.input}`}
                    >
                      <option value="">Select teammate</option>
                      {teamUsers.map(u => (
                        <option key={u._id} value={u._id}>{u.name} ({u.role})</option>
                      ))}
                    </select>
                  </div>
                </div>

                {!isProductionExecutive && (
                  <div className="space-y-1">
                    <label className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
                      Link to Lead (Optional)
                    </label>
                    <select
                      value={formData.leadId}
                      onChange={(e) => setFormData(prev => ({ ...prev, leadId: e.target.value }))}
                      className={`w-full h-10 px-3 rounded-xl border text-sm ${styles.input}`}
                    >
                      <option value="">No linked lead</option>
                      {leads.map(l => (
                        <option key={l._id} value={l._id}>{l.name} ({l.phone})</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Subtasks Section */}
                <div className="space-y-2">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
                    Subtasks / Checklist
                  </label>
                  
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add a subtask..."
                      value={newSubtaskTitle}
                      onChange={(e) => setNewSubtaskTitle(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask(); } }}
                      className={`flex-1 h-9 px-3 rounded-lg border text-xs ${styles.input}`}
                    />
                    <button
                      type="button"
                      onClick={handleAddSubtask}
                      className={`h-9 px-3 rounded-lg text-xs font-bold ${styles.button}`}
                    >
                      Add
                    </button>
                  </div>

                  {formData.subtasks && formData.subtasks.length > 0 && (
                    <div className={`rounded-xl border p-2 space-y-1.5 max-h-32 overflow-y-auto ${
                      isDark ? "border-slate-850 bg-slate-950/40" : "border-slate-150 bg-slate-50/50"
                    }`}>
                      {formData.subtasks.map((st, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs py-0.5">
                          <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0 pr-2">
                            <input
                              type="checkbox"
                              checked={st.isCompleted}
                              onChange={() => handleToggleSubtaskInForm(idx)}
                              className="rounded border-slate-700 bg-transparent text-sky-500 focus:ring-0 focus:ring-offset-0"
                            />
                            <span className={`truncate ${st.isCompleted ? "line-through text-slate-500" : styles.text}`}>
                              {st.title}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => handleRemoveSubtask(idx)}
                            className="text-rose-500 hover:text-rose-400 p-1 rounded"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Tags Section */}
                <div className="space-y-2">
                  <label className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
                    Category Tags
                  </label>
                  
                  <div className="flex flex-wrap gap-1.5">
                    {["Call", "Meeting", "Document", "Site Visit", "Urgent", "Follow-up"].map((t) => {
                      const isSelected = formData.tags && formData.tags.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => handleToggleTag(t)}
                          className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                            isSelected
                              ? "bg-sky-500/20 text-sky-400 border-sky-500/40"
                              : isDark
                                ? "border-slate-850 text-slate-400 hover:bg-slate-800"
                                : "border-slate-200 text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Or type custom tag..."
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomTag(); } }}
                      className={`flex-1 h-9 px-3 rounded-lg border text-xs ${styles.input}`}
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTag}
                      className={`h-9 px-3 rounded-lg text-xs font-bold ${styles.button}`}
                    >
                      Add Tag
                    </button>
                  </div>

                  {formData.tags && formData.tags.filter(t => !["Call", "Meeting", "Document", "Site Visit", "Urgent", "Follow-up"].includes(t)).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {formData.tags
                        .filter(t => !["Call", "Meeting", "Document", "Site Visit", "Urgent", "Follow-up"].includes(t))
                        .map(t => (
                          <span
                            key={t}
                            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                              isDark ? "bg-slate-850 text-slate-300 border-slate-700" : "bg-slate-100 text-slate-700 border-slate-200"
                            }`}
                          >
                            {t}
                            <button
                              type="button"
                              onClick={() => handleToggleTag(t)}
                              className="text-slate-400 hover:text-slate-200"
                            >
                              <X size={8} />
                            </button>
                          </span>
                        ))
                      }
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mobile-safe-footer -mx-4 flex items-center justify-end gap-2 border-t border-slate-200 bg-inherit px-4 pt-3 sm:mx-0 sm:border-t-0 sm:px-0 sm:pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className={`h-10 px-4 rounded-xl border text-sm font-semibold ${styles.button}`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className={`h-10 px-5 rounded-xl text-sm font-semibold disabled:opacity-60 ${styles.primaryButton}`}
                  >
                    {submitting ? "Saving..." : editingTask ? "Save Changes" : "Create Task"}
                  </button>
                </div>
              </form>
            </Motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
