import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from '../theme/tokens';
import AppHeader from './AppHeader';
export { colors } from '../theme/tokens';
export function Page({
  title,
  children,
  subtitle,
  eyebrow,
  header = true,
  onRefresh,
  refreshing = false,
}: PropsWithChildren<{
  title: string;
  subtitle?: string;
  eyebrow?: string;
  header?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}>) {
  return (
    <SafeAreaView style={styles.page} edges={['top', 'left', 'right']}>
      {header && <AppHeader />}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.tealDeep}
              />
            ) : undefined
          }
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          <View style={{ gap: 8 }}>
            {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
            <Text accessibilityRole="header" style={styles.title}>
              {title}
            </Text>
            {subtitle ? <Copy>{subtitle}</Copy> : null}
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}
export function Heading({ children }: PropsWithChildren) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
}
export function Eyebrow({ children }: PropsWithChildren) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}
export function Copy({ children, error = false }: PropsWithChildren<{ error?: boolean }>) {
  return (
    <Text
      accessibilityRole={error ? 'alert' : undefined}
      style={[styles.copy, error && { color: colors.danger }]}
    >
      {children}
    </Text>
  );
}
export function Button({
  title,
  onPress,
  disabled = false,
  secondary = false,
  icon,
  compact = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  secondary?: boolean;
  icon?: ReactNode;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && { paddingHorizontal: 10, borderRadius: 24 },
        secondary && styles.secondaryButton,
        pressed && { backgroundColor: secondary ? colors.soft : colors.sunsetActive },
        disabled && { opacity: 0.55 },
      ]}
    >
      {icon}
      <Text style={[styles.buttonText, secondary && { color: colors.tealDeep }]}>{title}</Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          styles.input,
          props.multiline && { minHeight: 96, textAlignVertical: 'top' },
          props.style,
        ]}
      />
    </View>
  );
}
export function Loading() {
  return (
    <View style={{ padding: 32 }}>
      <ActivityIndicator accessibilityLabel="Loading" color={colors.tealDeep} />
    </View>
  );
}
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: {
    paddingHorizontal: 20,
    paddingTop: 28,
    gap: 24,
    paddingBottom: 40,
    width: '100%',
    maxWidth: 1100,
    alignSelf: 'center',
  },
  title: {
    fontSize: 36,
    lineHeight: 40,
    letterSpacing: -0.72,
    color: colors.ink,
    fontFamily: fonts.serifMedium,
  },
  heading: {
    fontFamily: fonts.serifSemibold,
    fontSize: 24,
    letterSpacing: -0.36,
    color: colors.ink,
  },
  eyebrow: {
    fontFamily: fonts.bold,
    fontSize: 10.88,
    letterSpacing: 1.52,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  card: {
    backgroundColor: colors.paper,
    padding: 20,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 24,
    boxShadow: '0px 4px 20px #78716c0a',
  },
  copy: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.muted },
  label: { fontFamily: fonts.bold, fontSize: 11.52, color: colors.ink },
  input: {
    fontFamily: fonts.body,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    minHeight: 48,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontSize: 16,
  },
  button: {
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingVertical: 10.4,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.sunset,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButton: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: 12.48,
    color: colors.ink,
    textAlign: 'center',
    flexShrink: 1,
  },
});
