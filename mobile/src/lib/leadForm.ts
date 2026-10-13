/* Client-side checks for the Add lead form; the server re-validates everything. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const validateNewLead = (form: { name: string; phone: string; email: string }) => {
  const errors: Partial<Record<"name" | "phone" | "email", string>> = {};
  if (form.name.trim().length < 2) errors.name = "Enter the client's name";

  const digits = form.phone.replace(/[^\d]/g, "");
  // A bare 10-digit Indian mobile, or one written with its country code.
  const national = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!digits) errors.phone = "Enter a phone number";
  else if (national.length !== 10) errors.phone = "Phone number should have 10 digits";

  if (form.email.trim() && !EMAIL.test(form.email.trim())) errors.email = "That email doesn't look right";
  return errors;
};
