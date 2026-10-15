import { useNavigation } from "@react-navigation/native";

/* True when the screen is shown as a tab (Home by Role bar) rather than pushed, so it hides its back button. */
export const useInTabs = () => useNavigation().getState()?.type === "tab";
