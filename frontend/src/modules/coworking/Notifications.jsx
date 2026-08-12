import { Bell } from "lucide-react";
import ModulePlaceholder from "./components/ModulePlaceholder";

const Notifications = () => (
  <ModulePlaceholder
    title="Notifications"
    description="System notifications for bookings, invoices, contracts and tickets."
    icon={Bell}
    entityLabelPlural="notifications"
  />
);

export default Notifications;
