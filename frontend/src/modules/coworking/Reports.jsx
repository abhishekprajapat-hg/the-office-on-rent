import { BarChart3 } from "lucide-react";
import ModulePlaceholder from "./components/ModulePlaceholder";

const Reports = () => (
  <ModulePlaceholder
    title="Reports"
    description="Occupancy, revenue and operational reports for coworking spaces."
    icon={BarChart3}
    entityLabelPlural="reports"
  />
);

export default Reports;
