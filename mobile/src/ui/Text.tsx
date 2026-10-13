import React from "react";
import { Text as RNText, type TextProps } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { type, type TypeVariant } from "../theme/tokens";

type Props = TextProps & {
  variant?: TypeVariant;
  color?: "text" | "muted" | "faint" | "primary" | "danger" | "onPrimary" | string;
  align?: "left" | "center" | "right";
};

export const Text = ({ variant = "body", color = "text", align, style, ...rest }: Props) => {
  const { colors } = useTheme();
  const resolved =
    color === "text"
      ? colors.text
      : color === "muted"
        ? colors.textMuted
        : color === "faint"
          ? colors.textFaint
          : color === "primary"
            ? colors.primary
            : color === "danger"
              ? colors.danger
              : color === "onPrimary"
                ? colors.onPrimary
                : color;
  return <RNText {...rest} style={[type[variant], { color: resolved }, align ? { textAlign: align } : null, style]} />;
};
