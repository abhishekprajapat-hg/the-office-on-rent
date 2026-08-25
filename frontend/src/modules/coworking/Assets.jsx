import { Boxes } from "lucide-react";
import ModulePlaceholder from "./components/ModulePlaceholder";

const Assets = () => (
  <ModulePlaceholder
    title="Assets & Inventory"
    description="Furniture, equipment and consumable inventory across properties."
    icon={Boxes}
    entityLabelPlural="assets"
  />
);

export default Assets;
