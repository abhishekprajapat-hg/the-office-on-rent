import { api } from "./client";

/* Mirrors payroll.calc.js `buildSalary` - one month's pay for one person. */
export type SalaryLine = {
  key: string;
  label: string;
  count?: number;
  chargeableCount?: number;
  dates?: string[];
  unit?: "DAYS" | "AMOUNT" | "PERCENT" | string;
  value?: number;
  amount: number;
  custom?: boolean;
  scope?: string;
};

export type Salary = {
  month: string;
  from: string;
  to: string;
  throughDate: string | null;
  isFutureMonth: boolean;
  isMonthComplete: boolean;
  monthlySalary: number;
  perDayRate: number;
  perDayBasis: "CALENDAR_DAYS" | "WORKING_DAYS" | "FIXED_DAYS" | string;
  divisor: number;
  daysInMonth: number;
  workingDaysInMonth: number;
  lines: SalaryLine[];
  totalDeduction: number;
  netSalary: number;
};

export type SalaryRevision = { effectiveFrom?: string; monthlySalary?: number; note?: string; createdAt?: string; setAt?: string | null; setByName?: string };

export type MySalary = {
  month: string;
  timezone?: string;
  salary: Salary | null;
  salaryEffectiveFrom?: string | null;
  revisions: SalaryRevision[];
};

/* GET /salary/me?month=YYYY-MM - admins have no salary record (403). */
export const getMySalary = async (month: string) => {
  const res = await api.get<MySalary>("/salary/me", { params: { month } });
  return res.data;
};

/* ------------------------------------------------- payroll administration -- */
/* Web: modules/salary (team, a person's pay, deduction rules). Admins, and managers for their own team - never their own pay. */

export type DeductionUnit = "DAYS" | "AMOUNT" | "PERCENT";
export type DeductionRule = { unit: DeductionUnit; value: number };
export type RuleKey = "absent" | "unapprovedLeave" | "halfDay" | "unpaidLeave" | "paidLeave" | "late";

export type PayrollPolicy = {
  perDayBasis: "CALENDAR_DAYS" | "WORKING_DAYS" | "FIXED_DAYS";
  fixedDaysPerMonth: number;
  lateGraceCount: number;
  lateEveryCount: number;
} & Record<RuleKey, DeductionRule>;

/* A person's own attendance amounts; the same rule keys plus the late counts. */
export type EmployeeRules = Partial<Record<RuleKey, DeductionRule>> & { lateGraceCount?: number; lateEveryCount?: number; updatedByName?: string };

export type NamedDeduction = {
  _id: string;
  name: string;
  unit: DeductionUnit;
  value: number;
  frequency: "MONTHLY" | "ONCE";
  fromMonth: string;
  toMonth?: string;
  scope?: "COMPANY" | "EMPLOYEE";
  updatedByName?: string;
};
export type NamedDeductionInput = Omit<NamedDeduction, "_id" | "scope" | "updatedByName">;

export type SalaryPerson = { _id: string; name: string; email?: string; role?: string; department?: string; profileImageUrl?: string };

export type TeamSalaryRow = {
  user: SalaryPerson;
  salary: Salary | null;
  salaryEffectiveFrom?: string | null;
  latestMonthlySalary?: number | null;
  ownRules?: boolean;
};

export type TeamSalaries = {
  month: string;
  totals: { employees: number; withSalary: number; monthlyPayroll: number; totalDeduction: number; netPayable: number };
  rows: TeamSalaryRow[];
};

/* GET /salary/team?month - everyone the viewer manages, minus themselves. */
export const getTeamSalaries = async (month: string) => {
  const res = await api.get<TeamSalaries>("/salary/team", { params: { month } });
  return res.data;
};

export type MemberSalary = {
  month: string;
  user: SalaryPerson;
  salary: Salary | null;
  salaryEffectiveFrom?: string | null;
  latestMonthlySalary?: number | null;
  revisions: SalaryRevision[];
  deductions: NamedDeduction[];
  ownRules?: boolean;
  deductionRules: EmployeeRules | null;
  companyRules: PayrollPolicy;
  effectiveRules?: PayrollPolicy;
};

/* GET /salary/users/:id?month */
export const getMemberSalary = async (userId: string, month: string) => {
  const res = await api.get<MemberSalary>(`/salary/users/${userId}`, { params: { month } });
  return res.data;
};

/* PUT /salary/users/:id - adds a revision from a month on; earlier months keep the old figure. */
export const setMemberSalary = async (userId: string, payload: { monthlySalary: number; effectiveFrom: string; note?: string }) => {
  const res = await api.put<{ message?: string }>(`/salary/users/${userId}`, payload);
  return res.data?.message || "Salary saved";
};

/* PUT /salary/users/:id/rules - their own attendance amounts, or { useCompanyRules: true }. */
export const setMemberRules = async (userId: string, payload: EmployeeRules | { useCompanyRules: true }) => {
  const res = await api.put<{ message?: string }>(`/salary/users/${userId}/rules`, payload);
  return res.data?.message || "Deductions saved";
};

/* Removing a deduction as a manager answers 202 { approvalRequired } and waits for an admin. */
type RemoveResult = { pendingApproval: boolean; message: string };
const removed = (status: number, data?: { approvalRequired?: boolean; message?: string }): RemoveResult => ({
  pendingApproval: status === 202 || Boolean(data?.approvalRequired),
  message: data?.message || "Deduction removed",
});

export const addMemberDeduction = async (userId: string, payload: NamedDeductionInput) => {
  const res = await api.post<{ message?: string }>(`/salary/users/${userId}/deductions`, payload);
  return res.data?.message || "Deduction added";
};
export const updateMemberDeduction = async (userId: string, id: string, payload: NamedDeductionInput) => {
  const res = await api.patch<{ message?: string }>(`/salary/users/${userId}/deductions/${id}`, payload);
  return res.data?.message || "Deduction saved";
};
export const removeMemberDeduction = async (userId: string, id: string) => {
  const res = await api.delete<{ approvalRequired?: boolean; message?: string }>(`/salary/users/${userId}/deductions/${id}`);
  return removed(res.status, res.data);
};

export type PayrollPolicyView = { policy: PayrollPolicy; customDeductions: NamedDeduction[]; updatedAt?: string | null; updatedByName?: string; isDefault?: boolean };

/* GET /salary/policy - the company's deduction rules and named deductions. */
export const getPayrollPolicy = async () => {
  const res = await api.get<PayrollPolicyView>("/salary/policy");
  return res.data;
};
export const updatePayrollPolicy = async (payload: Partial<PayrollPolicy>) => {
  const res = await api.patch<PayrollPolicyView & { message?: string }>("/salary/policy", payload);
  return res.data;
};
export const addCompanyDeduction = async (payload: NamedDeductionInput) => {
  const res = await api.post<{ message?: string }>("/salary/policy/deductions", payload);
  return res.data?.message || "Deduction added";
};
export const updateCompanyDeduction = async (id: string, payload: NamedDeductionInput) => {
  const res = await api.patch<{ message?: string }>(`/salary/policy/deductions/${id}`, payload);
  return res.data?.message || "Deduction saved";
};
export const removeCompanyDeduction = async (id: string) => {
  const res = await api.delete<{ approvalRequired?: boolean; message?: string }>(`/salary/policy/deductions/${id}`);
  return removed(res.status, res.data);
};
