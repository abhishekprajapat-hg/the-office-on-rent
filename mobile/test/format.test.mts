import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dialable,
  formatDate,
  formatMinutes,
  formatTime,
  formatWhen,
  greeting,
  initials,
  isOverdue,
  whatsappNumber,
} from "../src/lib/format.ts";

const now = new Date(2026, 9, 12, 10, 0); // 12 Oct 2026, 10:00 local

test("formatTime uses a 12-hour clock with noon and midnight right", () => {
  assert.equal(formatTime(new Date(2026, 9, 12, 0, 5)), "12:05 AM");
  assert.equal(formatTime(new Date(2026, 9, 12, 12, 0)), "12:00 PM");
  assert.equal(formatTime(new Date(2026, 9, 12, 17, 30)), "5:30 PM");
  assert.equal(formatTime(null), "");
  assert.equal(formatTime("not a date"), "");
});

test("formatDate drops the year only for the current year", () => {
  assert.equal(formatDate(new Date(2026, 0, 3), now), "3 Jan");
  assert.equal(formatDate(new Date(2025, 11, 31), now), "31 Dec 2025");
});

test("formatWhen names today, tomorrow and yesterday", () => {
  assert.equal(formatWhen(new Date(2026, 9, 12, 16, 30), now), "Today, 4:30 PM");
  assert.equal(formatWhen(new Date(2026, 9, 13, 9, 0), now), "Tomorrow, 9:00 AM");
  assert.equal(formatWhen(new Date(2026, 9, 11, 9, 0), now), "Yesterday, 9:00 AM");
  assert.equal(formatWhen(new Date(2026, 9, 20, 9, 0), now), "20 Oct, 9:00 AM");
});

test("isOverdue compares against now", () => {
  assert.equal(isOverdue(new Date(2026, 9, 12, 9, 59), now), true);
  assert.equal(isOverdue(new Date(2026, 9, 12, 10, 1), now), false);
  assert.equal(isOverdue(null, now), false);
});

test("formatMinutes", () => {
  assert.equal(formatMinutes(0), "0m");
  assert.equal(formatMinutes(45), "45m");
  assert.equal(formatMinutes(120), "2h");
  assert.equal(formatMinutes(135), "2h 15m");
  assert.equal(formatMinutes(null), "0m");
  assert.equal(formatMinutes(-5), "0m");
});

test("greeting follows the hour", () => {
  assert.equal(greeting(new Date(2026, 9, 12, 8)), "Good morning");
  assert.equal(greeting(new Date(2026, 9, 12, 13)), "Good afternoon");
  assert.equal(greeting(new Date(2026, 9, 12, 19)), "Good evening");
});

test("initials", () => {
  assert.equal(initials("Abhishek Prajapat"), "AP");
  assert.equal(initials("  riya  "), "R");
  assert.equal(initials("A B C"), "AB");
  assert.equal(initials(""), "?");
});

test("phone helpers", () => {
  assert.equal(dialable("+91 98765-43210"), "+919876543210");
  assert.equal(dialable("098765 43210"), "09876543210");
  assert.equal(whatsappNumber("98765 43210"), "919876543210");
  assert.equal(whatsappNumber("+91 98765 43210"), "919876543210");
});
