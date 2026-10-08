import React from "react";
import { fieldClass } from "./salaryUi";
import { DEDUCTION_UNITS, deductionUnit } from "./salaryFormat";

/*
 * A deduction's value and the unit it is in, side by side: "1 [days of pay]",
 * "500 [rupees]", "5 [% of monthly salary]". The input's limits follow the
 * unit, and changing the unit empties the value - 1 day's pay is not 1 rupee,
 * and carrying the number across would save a deduction nobody meant.
 */
export default function DeductionValueInput({ rule, onChange, disabled, label }) {
  const unit = deductionUnit(rule.unit);
  return (
    <span className="flex items-center gap-2 text-[13px] text-slate-600">
      <input
        type="number"
        min="0"
        max={unit.max}
        step={unit.step}
        value={rule.value}
        disabled={disabled}
        onChange={(event) => onChange({ ...rule, value: event.target.value })}
        className={`${fieldClass} ${unit.value === "AMOUNT" ? "w-28" : "w-20"} text-right font-mono`}
        aria-label={`${label} value`}
        placeholder="0"
      />
      <select
        value={rule.unit}
        disabled={disabled}
        onChange={(event) => onChange({ unit: event.target.value, value: "" })}
        className={fieldClass}
        aria-label={`${label} unit`}
      >
        {DEDUCTION_UNITS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </span>
  );
}
