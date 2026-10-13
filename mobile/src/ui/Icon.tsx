import React from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "../theme/ThemeProvider";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export const Icon = ({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) => {
  const { colors } = useTheme();
  return <Ionicons name={name} size={size} color={color || colors.text} />;
};
