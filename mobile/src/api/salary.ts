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

export type SalaryRevision = { effectiveFrom?: string; monthlySalary?: number; note?: string; createdAt?: string };

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
