import { Pressable, PressableStateCallbackType, Text } from "react-native";
import { fonts, radius } from "../theme/tokens";
import { useTheme } from "../theme/useTheme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "outline" | "primary" | "text";
};

export function Button({
  label,
  onPress,
  disabled,
  variant = "outline",
}: Props) {
  const { t } = useTheme();
  const primary = variant === "primary";
  const text = variant === "text";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={(state: PressableStateCallbackType) => {
        const hovered = (
          state as PressableStateCallbackType & { hovered?: boolean }
        ).hovered;
        return {
          paddingHorizontal: 12,
          paddingVertical: 7,
          borderRadius: radius.button,
          borderWidth: text ? 0 : 1,
          justifyContent: "center",
          alignItems: "center",
          opacity: disabled ? 0.5 : 1,
          backgroundColor: text
            ? "transparent"
            : primary
              ? hovered
                ? t.accent.blueHover
                : t.accent.blue
              : t.bg.button,
          borderColor: primary
            ? hovered
              ? t.accent.blueHover
              : t.accent.blue
            : hovered
              ? t.border.strongHover
              : t.border.strong,
        };
      }}
    >
      {(state: PressableStateCallbackType) => {
        const hovered = (
          state as PressableStateCallbackType & { hovered?: boolean }
        ).hovered;
        return (
          <Text
            style={{
              fontFamily: fonts.sans500,
              fontSize: 13,
              color: primary
                ? t.text.onAccent
                : text
                  ? hovered || state.pressed
                    ? t.text.primary
                    : t.text.dim
                  : t.text.primary,
            }}
          >
            {label}
          </Text>
        );
      }}
    </Pressable>
  );
}
