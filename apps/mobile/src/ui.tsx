import React, {useState} from 'react';
import {ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, Animated, type TextInputProps, type TextProps, type StyleProp, type ViewStyle, type TextStyle} from 'react-native';

import {SafeAreaView} from 'react-native-safe-area-context';
import {tokens, usePalette, useTypeStyle, type Typography} from './theme';
import {Icon, type IconName} from './icons';
export {tokens, palettes, usePalette} from './theme';
export {Icon} from './icons';

export function Type({children, title = false, muted = false, variant, style, ...props}: TextProps & {
  title?: boolean; muted?: boolean; variant?: Typography;
}) {
  const p = usePalette();
  const role = variant ?? (title ? 'title' : 'body');
  const typography = useTypeStyle(role);
  return <Text {...props} accessibilityRole={props.accessibilityRole ??
    (['display', 'hero', 'title', 'heading', 'section', 'editorHeading', 'sheetHeading'].includes(role) ? 'header' : undefined)}
    style={[typography, {color: muted ? p.secondaryText : p.primaryText}, style]}>{children}</Text>;
}

export function Screen({children, compact = false, contentWidth = tokens.width}: React.PropsWithChildren<{compact?: boolean; contentWidth?: number}>) {
  const p = usePalette();
  return <SafeAreaView style={{flex: 1, backgroundColor: p.background}}>
    <KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow: 1,
        padding: compact ? tokens.space.medium : tokens.geometry.screenPadding,
        gap: compact ? tokens.space.medium : tokens.space.large,
        maxWidth: contentWidth, width: '100%', alignSelf: 'center'}}>{children}</ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export function LoadingIndicator({label = 'Loading', color, ...props}: React.ComponentProps<typeof ActivityIndicator> & {label?: string}) {
  const p = usePalette();
  return <ActivityIndicator {...props} accessibilityLabel={props.accessibilityLabel ?? label} accessibilityRole="progressbar" color={color ?? p.brand}/>;
}
type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export function Button({label, onPress, busy = false, disabled = false, variant = 'primary',
  leading, size = 'default', style, labelStyle, accessibilityLabel, buttonRef}: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; variant?: ButtonVariant;
  leading?: React.ReactNode; size?: 'default' | 'hero' | 'compact'; style?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>; accessibilityLabel?: string; buttonRef?: React.Ref<React.ComponentRef<typeof Pressable>>;
}) {
  const p = usePalette();
  const primary = variant === 'primary', quiet = variant === 'quiet';
  const foreground = primary ? p.onButton : variant === 'danger' ? p.error : p.primaryText;
  return <Pressable ref={buttonRef} accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{disabled: disabled || busy, busy}} disabled={disabled || busy} onPress={onPress}
    style={({pressed}) => [{minHeight: size === 'hero' ? tokens.geometry.heroButtonHeight :
      size === 'compact' || quiet ? tokens.touch : tokens.geometry.buttonHeight,
      borderRadius: tokens.radii.button, paddingHorizontal: tokens.space.large,
      paddingVertical: tokens.space.compact, alignItems: 'center', justifyContent: 'center',
      backgroundColor: primary ? p.button : quiet ? 'transparent' : p.surface,
      borderWidth: primary || quiet ? 0 : tokens.geometry.divider,
      borderColor: variant === 'danger' ? p.error : p.line,
      opacity: disabled ? 0.5 : pressed ? 0.76 : 1}, style]}>
    {busy ? <LoadingIndicator label="Please wait" color={foreground}/> :
      <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: tokens.space.compact}}>
        {leading}<Type variant={size === 'hero' ? 'heroButton' : 'button'} style={[{color: foreground, textAlign: 'center', flexShrink: 1}, labelStyle]}>{label}</Type>
      </View>}
  </Pressable>;
}

export type InputHandle = React.ComponentRef<typeof TextInput>;
export function Input({label, style, onFocus, onBlur, inputRef, hideLabel = false, leading, trailing, rounded = false, ...props}: TextInputProps & {
  label: string; inputRef?: React.Ref<InputHandle>; hideLabel?: boolean;
  leading?: React.ReactNode; trailing?: React.ReactNode; rounded?: boolean;
}) {
  const p = usePalette();
  const typography = useTypeStyle('body');
  const [focused, setFocused] = useState(false);
  const decorated = rounded || Boolean(leading || trailing);
  const field = <TextInput {...props} ref={inputRef} accessibilityLabel={label}
    placeholderTextColor={props.placeholderTextColor ?? p.mutedText} selectionColor={p.brand}
    onFocus={event => {setFocused(true); onFocus?.(event);}}
    onBlur={event => {setFocused(false); onBlur?.(event);}}
    style={[typography, {minHeight: tokens.geometry.buttonHeight, paddingVertical: tokens.space.compact,
      color: p.primaryText}, decorated ? {flex: 1, minWidth: 0,
      paddingHorizontal: leading ? tokens.space.compact : tokens.space.none} : {
      paddingHorizontal: tokens.space.medium, backgroundColor: p.surface, borderWidth: tokens.geometry.divider,
      borderColor: focused ? p.lineFocused : p.line, borderRadius: tokens.radii.medium}, style]}/>;
  return <View style={{gap: tokens.space.small}}>
    {!hideLabel && <Type variant="label">{label}</Type>}
    {decorated ? <View style={{flexDirection: 'row', alignItems: 'center', minHeight: tokens.geometry.buttonHeight,
      paddingHorizontal: tokens.space.medium, backgroundColor: p.surface,
      borderWidth: focused ? tokens.geometry.strokeWidth : tokens.geometry.divider,
      borderColor: focused ? p.lineFocused : p.line, borderRadius: rounded ? tokens.radii.full : tokens.radii.medium}}>
      {leading}{field}{trailing}
    </View> : field}
  </View>;
}

export function Notice({children, kind = 'info'}: React.PropsWithChildren<{kind?: 'info' | 'error' | 'success' | 'warning'}>) {
  const p = usePalette();
  return <View accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'} accessibilityRole={kind === 'error' ? 'alert' : undefined}>
    <Type variant="caption" style={{color: kind === 'error' ? p.error : kind === 'success' ? p.success : kind === 'warning' ? p.warning : p.secondaryText}}>{children}</Type>
  </View>;
}
export function TextAction({label, onPress, disabled = false, icon}: {
  label: string; onPress: () => void; disabled?: boolean; icon?: IconName;
}) {
  const p = usePalette();
  // Legacy callers keep their contracts while navigation arrows become real icons.
  const back = label.startsWith('← '), forward = label.startsWith('→ ');
  const clean = back || forward ? label.slice(2) : label;
  return <Pressable accessibilityRole="button" accessibilityLabel={clean} accessibilityState={{disabled}}
    disabled={disabled} onPress={onPress} style={({pressed}) => ({minHeight: tokens.touch,
      paddingVertical: tokens.space.compact, paddingHorizontal: tokens.space.small,
      flexDirection: 'row', alignItems: 'center', gap: tokens.space.small, alignSelf: 'flex-start',
      opacity: disabled ? 0.5 : pressed ? 0.7 : 1})}>
    {(icon || back || forward) && <Icon name={icon ?? (back ? 'back' : 'chevron')} color={p.brand}/>}
    <Type variant="label" style={{color: p.brand, flexShrink: 1}}>{clean}</Type>
  </Pressable>;
}
export function BackButton({label = 'Back', onPress}: {label?: string; onPress: () => void}) {
  return <TextAction label={label} onPress={onPress} icon="back"/>;
}
export function Card({children, style}: React.PropsWithChildren<{style?: StyleProp<ViewStyle>}>) {
  const p = usePalette();
  return <View style={[{backgroundColor: p.surface, borderRadius: tokens.radii.large,
    borderWidth: tokens.geometry.divider, borderColor: p.line, padding: tokens.space.medium}, style]}>{children}</View>;
}
export function FilterChip({label, selected, onPress, disabled = false}: {
  label: string; selected: boolean; onPress: () => void; disabled?: boolean;
}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected, disabled}}
    disabled={disabled} onPress={onPress} style={({pressed}) => ({minHeight: tokens.touch,
      borderRadius: tokens.radii.full, paddingHorizontal: tokens.space.medium, paddingVertical: tokens.space.small,
      borderWidth: tokens.geometry.divider, borderColor: selected ? p.button : p.line,
      alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? p.button : 'transparent',
      opacity: disabled ? 0.5 : pressed ? 0.75 : 1})}>
    <Type variant="chip" style={{color: selected ? p.onButton : p.primaryText}}>{label}</Type>
  </Pressable>;
}
export function IconButton({label, children, onPress, disabled = false, selected, icon, color, filled, buttonRef}: React.PropsWithChildren<{
  label: string; onPress: () => void; disabled?: boolean; selected?: boolean; icon?: IconName; color?: string; filled?: boolean; buttonRef?: React.Ref<React.ComponentRef<typeof Pressable>>;
}>) {
  const p = usePalette();
  return <Pressable ref={buttonRef} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled, selected}}
    disabled={disabled} onPress={onPress} style={({pressed}) => ({minWidth: tokens.touch, minHeight: tokens.touch,
      borderRadius: tokens.radii.full, alignItems: 'center', justifyContent: 'center',
      backgroundColor: pressed ? p.surfaceMuted : 'transparent', opacity: disabled ? 0.5 : 1})}>
    {icon ? <Icon name={icon} color={color} filled={filled}/> : children}
  </Pressable>;
}
export function Divider({inset = 0}: {inset?: number}) {
  const p = usePalette();
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{height: tokens.geometry.divider, marginLeft: inset, backgroundColor: p.line}}/>;
}
export function RecoveryState({title, description, onRetry, retryLabel = 'Try again'}: {
  title: string; description: string; onRetry?: () => void; retryLabel?: string;
}) {
  return <View style={{paddingVertical: tokens.space.section, gap: tokens.space.medium}}>
    <Type variant="section">{title}</Type><Type muted>{description}</Type>
    {!!onRetry && <Button label={retryLabel} variant="secondary" onPress={onRetry}/>}
  </View>;
}
export const EmptyState = RecoveryState;
export function SectionHeader({title, action}: {title: string; action?: React.ReactNode}) {
  return <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.small}}>
    <Type variant="section" style={{flex: 1}}>{title}</Type>{action}
  </View>;
}
export function SourcePlaceholder({kind, size = tokens.geometry.thumbnail}: {kind: string; size?: number}) {
  const p = usePalette();
  const name = kind === 'url' || kind === 'link' ? 'link' : kind === 'pdf' ? 'pdf' : kind === 'image' ? 'image' : 'note';
  return <View style={{width: size, height: size, borderRadius: tokens.radii.tile, backgroundColor: p.avatar,
    alignItems: 'center', justifyContent: 'center'}}><Icon name={name} color={p.onAvatar} size={tokens.geometry.iconLarge}/></View>;
}
/** Surface only: the caller retains Modal, route, gesture and dismissal ownership. */
export function SheetSurface({children, style, animated = false, ...props}: React.ComponentProps<typeof Animated.View> & {animated?: boolean}) {
  const p = usePalette();
  const Surface = Animated.View;
  return <Surface {...props} accessibilityViewIsModal style={[{width: '100%', maxWidth: tokens.geometry.sheetWidth,
    alignSelf: 'center', borderTopLeftRadius: tokens.radii.sheet, borderTopRightRadius: tokens.radii.sheet,
    borderWidth: tokens.geometry.divider, borderColor: p.sheetLine, backgroundColor: p.sheetSurface,
    overflow: 'hidden', shadowColor: p.shadow, ...tokens.elevation.sheet}, style]}>{children}</Surface>;
}
export function ActionRow({title, subtitle, icon, onPress}: {title: string; subtitle?: string; icon: IconName; onPress: () => void}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel={[title, subtitle].filter(Boolean).join('. ')}
    onPress={onPress} style={({pressed}) => ({minHeight: tokens.geometry.sheetActionHeight, flexDirection: 'row',
      alignItems: 'center', gap: tokens.space.medium, paddingVertical: tokens.space.compact,
      borderBottomWidth: tokens.geometry.divider, borderBottomColor: p.line, opacity: pressed ? 0.65 : 1})}>
    <View style={{width: tokens.geometry.fab, height: tokens.geometry.fab, borderRadius: tokens.radii.button,
      backgroundColor: p.iconSurface, alignItems: 'center', justifyContent: 'center'}}>
      <Icon name={icon} color={p.brand} size={tokens.geometry.iconLarge}/>
    </View>
    <View style={{flex: 1, gap: tokens.space.tiny}}><Type variant="actionTitle">{title}</Type>
      {!!subtitle && <Type variant="secondary" muted>{subtitle}</Type>}</View>
    <Icon name="chevron" color={p.brand}/>
  </Pressable>;
}
