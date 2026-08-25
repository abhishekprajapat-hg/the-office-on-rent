import { Presentation } from "lucide-react";
import ModulePlaceholder from "./components/ModulePlaceholder";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "booked", label: "Booked" },
  { value: "maintenance", label: "Maintenance" },
];

const MeetingRooms = () => (
  <ModulePlaceholder
    title="Meeting Rooms"
    description="Bookable meeting and conference rooms across properties."
    icon={Presentation}
    entityLabelPlural="meeting rooms"
    statusOptions={STATUS_OPTIONS}
  />
);

export default MeetingRooms;
