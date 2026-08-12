import { UserCheck } from "lucide-react";
import ModulePlaceholder from "./components/ModulePlaceholder";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "checked_in", label: "Checked In" },
  { value: "checked_out", label: "Checked Out" },
];

const Visitors = () => (
  <ModulePlaceholder
    title="Visitors"
    description="Visitor check-in and check-out log across properties."
    icon={UserCheck}
    entityLabelPlural="visitors"
    statusOptions={STATUS_OPTIONS}
  />
);

export default Visitors;
