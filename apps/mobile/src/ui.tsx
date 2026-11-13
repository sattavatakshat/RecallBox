import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, TextInputProps, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// November 8 RecallBox UX blueprint: restrained native field-notebook surfaces.
export const tokens = {space: {small: 8, medium: 16, large: 24, section: 40}, radius: 16, width: 520};
export function usePalette() {
  return useColorScheme() === 'dark'
    ? {paper: '#171E1A', surface: '#222D26', ink: '#F2F0E7', muted: '#BCC9BE', accent: '#CFE0BA', onAccent: '#17231B', line: '#3B4A40'}
    : {paper: '#F6F4EC', surface: '#FFFFFF', ink: '#25392D', muted: '#526359', accent: '#284D3B', onAccent: '#FFFFFF', line: '#DEE3DA'};
}
export function Type({children, title = false, muted = false}: React.PropsWithChildren<{title?: boolean; muted?: boolean}>) {
  const p = usePalette();
  return <Text style={{color: muted ? p.muted : p.ink, fontFamily: title ? Platform.select({ios: 'Georgia', android: 'serif'}) : undefined, fontSize: title ? 32 : 16, lineHeight: title ? 40 : 24, fontWeight: title ? '400' : '400'}}>{children}</Text>;
}
export function Screen({children}: React.PropsWithChildren) {
  const p = usePalette();
  return <SafeAreaView style={{flex: 1, backgroundColor: p.paper}}><KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow: 1, padding: 24, gap: 24, maxWidth: tokens.width, width: '100%', alignSelf: 'center'}}>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
export function Button({label, onPress, busy = false, disabled = false}: {label: string; onPress: () => void; busy?: boolean; disabled?: boolean}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityState={{disabled: disabled || busy, busy}} disabled={disabled || busy} onPress={onPress} style={({pressed}) => ({minHeight: 56, borderRadius: tokens.radius, backgroundColor: p.accent, padding: 16, justifyContent: 'center', opacity: pressed || disabled ? 0.6 : 1})}>{busy ? <ActivityIndicator accessibilityLabel="Please wait" color={p.onAccent}/> : <Text style={{color: p.onAccent, fontSize: 17, fontWeight: '600', textAlign: 'center'}}>{label}</Text>}</Pressable>;
}
export function Input({label, ...props}: TextInputProps & {label: string}) {
  const p = usePalette();
  return <View style={{gap: 8}}><Type>{label}</Type><TextInput accessibilityLabel={label} {...props} style={[{borderWidth: 1, borderColor: p.line, borderRadius: tokens.radius, backgroundColor: p.surface, minHeight: 56, padding: 16, color: p.ink, fontSize: 16}, props.style]} /></View>;
}
export function Notice({children}: React.PropsWithChildren) { return <View accessibilityLiveRegion="polite"><Type muted>{children}</Type></View>; }
export function TextAction({label, onPress, disabled = false}: {label: string; onPress: () => void; disabled?: boolean}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled}
    onPress={onPress} style={{minHeight: 48, paddingVertical: 12, paddingHorizontal: 8, justifyContent: 'center', opacity: disabled ? 0.5 : 1}}>
    <Text style={{color: p.ink, fontSize: 16, fontWeight: '600'}}>{label}</Text>
  </Pressable>;
}
