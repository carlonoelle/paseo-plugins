import type { PluginTheme } from "@getpaseo/plugin";
import { Icon } from "@getpaseo/plugin/client/react-native";
import { type ReactNode, useMemo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export function useStyles(theme: PluginTheme, compact: boolean) {
  return useMemo(() => {
    const c = theme.colors;
    return {
      screen: { flex: 1, backgroundColor: c.surface0 },
      toolbar: {
        paddingHorizontal: compact ? 12 : 20,
        paddingTop: compact ? 12 : 16,
        paddingBottom: 8,
        gap: 10,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      },
      row: { flexDirection: "row" as const, alignItems: "center" as const, gap: 8 },
      wrap: { flexDirection: "row" as const, flexWrap: "wrap" as const, alignItems: "center" as const, gap: 6 },
      input: {
        flex: 1,
        minHeight: 36,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: c.surface2,
        color: c.foreground,
        fontSize: 14,
      },
      title: { color: c.foreground, fontSize: compact ? 17 : 19, fontWeight: "600" as const },
      text: { color: c.foreground, fontSize: 14, lineHeight: 20 },
      muted: { color: c.foregroundMuted, fontSize: 13 },
      small: { color: c.foregroundMuted, fontSize: 12 },
      danger: { color: c.statusDanger, fontSize: 13 },
      warning: { color: c.statusWarning, fontSize: 13 },
      heading: { color: c.foregroundMuted, fontSize: 12, fontWeight: "600" as const, textTransform: "uppercase" as const, letterSpacing: 0.5 },
      mono: { color: c.foregroundMuted, fontSize: 12, fontFamily: "monospace" },
      card: { padding: 12, gap: 8, borderRadius: 10, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface1 },
      divider: { height: 1, backgroundColor: c.border },
    };
  }, [theme, compact]);
}

export type Styles = ReturnType<typeof useStyles>;

export function Chip({
  theme,
  label,
  selected,
  onPress,
}: {
  theme: PluginTheme;
  label: string;
  selected: boolean;
  onPress(): void;
}) {
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: selected ? c.accent : c.border,
        backgroundColor: selected ? c.accent : pressed ? c.surface2 : c.surface1,
      })}
    >
      <Text style={{ color: selected ? c.accentForeground : c.foreground, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Button({
  theme,
  label,
  icon,
  onPress,
  disabled,
  busy,
  variant = "secondary",
}: {
  theme: PluginTheme;
  label: string;
  icon?: string;
  onPress(): void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "secondary";
}) {
  const c = theme.colors;
  const primary = variant === "primary";
  const color = primary ? c.accentForeground : c.foreground;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: 8,
        borderWidth: primary ? 0 : 1,
        borderColor: c.border,
        backgroundColor: primary ? c.accent : pressed ? c.surface2 : c.surface1,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
      })}
    >
      {busy ? <ActivityIndicator size="small" color={color} /> : icon ? <Icon name={icon} size={16} color={color} /> : null}
      <Text style={{ color, fontSize: 14, fontWeight: primary ? "600" : "400" }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  theme,
  icon,
  label,
  onPress,
  busy,
}: {
  theme: PluginTheme;
  icon: string;
  label: string;
  onPress(): void;
  busy?: boolean;
}) {
  const c = theme.colors;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={busy}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 8,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: pressed ? c.surface2 : c.surface1,
      })}
    >
      {busy ? <ActivityIndicator size="small" color={c.foregroundMuted} /> : <Icon name={icon} size={16} color={c.foreground} />}
    </Pressable>
  );
}

export function Notice({ theme, children }: { theme: PluginTheme; children: ReactNode }) {
  return (
    <View
      style={{
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.statusWarning,
        backgroundColor: theme.colors.surface1,
      }}
    >
      <Text style={{ color: theme.colors.foreground, fontSize: 13 }}>{children}</Text>
    </View>
  );
}
