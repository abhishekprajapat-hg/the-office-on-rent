/* Add-property form checks, before the round trip; the server re-validates. Pure; unit tested. */

export const validateProperty = (form: {
  projectName: string;
  towerName: string;
  location: string;
  type: string;
  price: number | null;
  rent: number | null;
}) => {
  const errors: Record<string, string> = {};
  if (!form.projectName.trim()) errors.projectName = "Enter the project or building name";
  if (!form.towerName.trim()) errors.towerName = "Enter the tower, block or unit";
  if (!form.location.trim()) errors.location = "Enter where the property is";
  if (form.type !== "Rent" && !form.price) errors.price = "Enter the sale price";
  if (form.type !== "Sale" && !form.rent) errors.rent = "Enter the monthly rent";
  return errors;
};
