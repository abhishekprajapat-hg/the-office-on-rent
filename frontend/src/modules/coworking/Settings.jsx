import { Settings as SettingsIcon } from "lucide-react";
import ModulePlaceholder from "./components/ModulePlaceholder";

const Settings = () => (
  <ModulePlaceholder
    title="Coworking Settings"
    description="Configuration for coworking-specific policies and defaults."
    icon={SettingsIcon}
    entityLabelPlural="settings"
  />
);

export default Settings;
