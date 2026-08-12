import { Ticket } from "lucide-react";
import ModulePlaceholder from "./components/ModulePlaceholder";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const Tickets = () => (
  <ModulePlaceholder
    title="Tickets"
    description="Maintenance and support tickets raised by clients or staff."
    icon={Ticket}
    entityLabelPlural="tickets"
    statusOptions={STATUS_OPTIONS}
  />
);

export default Tickets;
