import React from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  Text, TextInput, View, useColorScheme,
} from 'react-native';
import type {TextInputProps, TextStyle, StyleProp, ViewStyle} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

/**
 * RecallBox field-notebook design system.
 * UX-001: visual foundations only; existing feature screens keep working.
 * Contrast and touch sizes are intentional for light/dark phones.
 */
export const tokens = {
  space: {tiny: 4, small: 8, compact: 12, medium: 16, large: 24, section: 40},
  radius: 16,
  radii: {small: 10, medium: 16, large: 20, full: 999},
  width: 520,
  touch: 48,
  type: {
    eyebrow: {fontSize: 11, lineHeight: 16, letterSpacing: 1.2} as TextStyle,
    caption: {fontSize: 13, lineHeight: 19} as TextStyle,
    body: {fontSize: 16, lineHeight: 24} as TextStyle,
    label: {fontSize: 15, lineHeight: 21, fontWeight: '600'} as TextStyle,
    section: {fontSize: 20, lineHeight: 28, fontWeight: '600'} as TextStyle,
    title: {fontSize: 34, lineHeight: 41} as TextStyle,
  },
} as const;

export const palettes = {
  light: {
    paper: '#F6F4EC', surface: '#FFFFFF', surfaceMuted: '#EEEFE8',
    ink: '#25392D', muted: '#526359', faint: '#66786D',
    accent: '#284D3B', onAccent: '#FFFFFF', line: '#DEE3DA',
    success: '#246A4A', danger: '#A43439', onDanger: '#FFFFFF',
  },
  dark: {
    paper: '#171E1A', surface: '#222D26', surfaceMuted: '#2A382E',
    ink: '#F2F0E7', muted: '#BCC9BE', faint: '#A4B8A9',
    accent: '#CFE0BA', onAccent: '#17231B', line: '#3B4A40',
    success: '#AEDABD', danger: '#FF9A9C', onDanger: '#26191B',
  },
} as const;

export function usePalette() {
  return useColorScheme() === 'dark' ? palettes.dark : palettes.light;
}

type Typography = 'body' | 'caption' | 'eyebrow' | 'label' | 'section' | 'title';
export function Type({children, title = false, muted = false, variant,
  style, numberOfLines}: React.PropsWithChildren<{
    title?: boolean; muted?: boolean; variant?: Typography;
    style?: StyleProp<TextStyle>; numberOfLines?: number;
  }>) {
  const p = usePalette();
  const kind = variant ?? (title ? 'title' : 'body');
  const longTitle = kind === 'title' && typeof children === 'string' && children.length > 40;
  return <Text numberOfLines={numberOfLines}
    style={[
      {color: muted ? p.muted : p.ink},
      tokens.type[kind],
      kind === 'title' && {
        fontFamily: Platform.select({ios: 'Georgia', android: 'serif'}),
        fontSize: longTitle ? 30 : tokens.type.title.fontSize,
        lineHeight: longTitle ? 37 : tokens.type.title.lineHeight,
      },
      style,
    ]}>{children}</Text>;
}

export function Screen({children, compact = false}: React.PropsWithChildren<{compact?: boolean}>) {
  const p = usePalette();
  return <SafeAreaView style={{flex: 1, backgroundColor: p.paper}}>
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1, padding: compact ? tokens.space.medium : tokens.space.large,
          gap: compact ? tokens.space.medium : tokens.space.large,
          maxWidth: tokens.width, width: '100%', alignSelf: 'center',
        }}>{children}</ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export function Button({label, onPress, busy = false, disabled = false, variant = 'primary'}: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean;
  variant?: ButtonVariant;
}) {
  const p = usePalette();
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const foreground = isPrimary ? p.onAccent : isDanger ? p.danger : p.ink;
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{disabled: disabled || busy, busy}} disabled={disabled || busy}
    onPress={onPress}
    style={({pressed}) => ({
      minHeight: 52, borderRadius: tokens.radii.medium,
      paddingHorizontal: tokens.space.large, paddingVertical: tokens.space.compact,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: isPrimary ? p.accent : variant === 'quiet' ? 'transparent' : p.surface,
      borderWidth: isPrimary || variant === 'quiet' ? 0 : 1,
      borderColor: isDanger ? p.danger : p.line,
      opacity: pressed ? 0.76 : disabled ? 0.5 : 1,
    })}>
    {busy ? <ActivityIndicator accessibilityLabel="Please wait" color={foreground}/> :
      <Text style={{color: foreground, fontSize: 16, lineHeight: 22, fontWeight: '600', textAlign: 'center'}}>{label}</Text>}
  </Pressable>;
}

export function Input({label, style, ...props}: TextInputProps & {label: string}) {
  const p = usePalette();
  return <View style={{gap: tokens.space.small}}>
    <Type variant="label">{label}</Type>
    <TextInput {...props} accessibilityLabel={label}
      placeholderTextColor={props.placeholderTextColor ?? p.faint}
      selectionColor={p.accent}
      style={[{
        minHeight: 52, paddingHorizontal: tokens.space.medium,
        paddingVertical: tokens.space.compact, backgroundColor: p.surface,
        borderWidth: 1, borderColor: p.line, borderRadius: tokens.radii.medium,
        color: p.ink, fontSize: 16, lineHeight: 24,
      }, style]}/>
  </View>;
}

export function Notice({children, kind = 'info'}: React.PropsWithChildren<{
  kind?: 'info' | 'error' | 'success';
}>) {
  const p = usePalette();
  return <View accessibilityLiveRegion="polite">
    <Type variant="caption" style={{color: kind === 'error' ? p.danger : kind === 'success' ? p.success : p.muted}}>
      {children}
    </Type>
  </View>;
}

export function TextAction({label, onPress, disabled = false}: {
  label: string; onPress: () => void; disabled?: boolean;
}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed}) => ({
      minHeight: tokens.touch, paddingVertical: tokens.space.compact,
      paddingHorizontal: tokens.space.small, alignSelf: 'flex-start',
      justifyContent: 'center', opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
    })}>
    <Text style={{color: p.accent, fontSize: 15, fontWeight: '600', lineHeight: 21}}>{label}</Text>
  </Pressable>;
}

/** Neutral surface reused for memory rows, collection previews and contextual panels. */
export function Card({children, style}: React.PropsWithChildren<{style?: StyleProp<ViewStyle>}>) {
  const p = usePalette();
  return <View style={[{
    backgroundColor: p.surface, borderRadius: tokens.radii.large,
    borderWidth: 1, borderColor: p.line, padding: tokens.space.medium,
  }, style]}>{children}</View>;
}

/** Optional filter. The consuming screen owns filter state. */
export function FilterChip({label, selected, onPress, disabled = false}: {
  label: string; selected: boolean; onPress: () => void; disabled?: boolean;
}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{selected, disabled}} disabled={disabled} onPress={onPress}
    style={({pressed}) => ({
      minHeight: tokens.touch, borderRadius: tokens.radii.full,
      paddingHorizontal: tokens.space.medium, paddingVertical: tokens.space.compact,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: selected ? p.accent : p.surfaceMuted,
      opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
    })}>
    <Text style={{fontSize: 14, fontWeight: '600', color: selected ? p.onAccent : p.ink}}>{label}</Text>
  </Pressable>;
}

/** Explicit accessible tap target; the child is a real icon or short text label. */
export function IconButton({label, children, onPress, disabled = false}: React.PropsWithChildren<{
  label: string; onPress: () => void; disabled?: boolean;
}>) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={({pressed}) => ({
      minWidth: tokens.touch, minHeight: tokens.touch, borderRadius: tokens.radii.full,
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: pressed ? p.surfaceMuted : 'transparent',
      opacity: disabled ? 0.5 : 1,
    })}>{children}</Pressable>;
}

export function Divider() {
  const p = usePalette();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{height: 1, backgroundColor: p.line}}/>;
}
