import React from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, TextInputProps, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export const tokens = {space: {small: 8, medium: 16, large: 28, section: 48}, radius: 18, width: 520};
export function usePalette() {
  return useColorScheme() === 'dark'
    ? {paper: '#171D19', ink: '#F2ECDD', muted: '#B4BFB5', accent: '#D5E7A6', onAccent: '#243526', line: '#465449'}
    : {paper: '#F3EFE4', ink: '#223A2D', muted: '#53655A', accent: '#294F3B', onAccent: '#FBF8EE', line: '#BBC9BB'};
}
export function Type({children, title = false, muted = false}: React.PropsWithChildren<{title?: boolean; muted?: boolean}>) {
  const p = usePalette();
  return <Text style={{color: muted ? p.muted : p.ink, fontFamily: title ? Platform.select({ios: 'Georgia', android: 'serif'}) : undefined, fontSize: title ? 42 : 17, lineHeight: title ? 49 : 26, fontWeight: title ? '400' : '400'}}>{children}</Text>;
}
export function Screen({children}: React.PropsWithChildren) {
  const p = usePalette();
  return <SafeAreaView style={{flex: 1, backgroundColor: p.paper}}><KeyboardAvoidingView style={{flex: 1}} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{flexGrow: 1, padding: 28, gap: 28, maxWidth: tokens.width, width: '100%', alignSelf: 'center'}}>{children}</ScrollView></KeyboardAvoidingView></SafeAreaView>;
}
export function Button({label, onPress, busy = false, disabled = false}: {label: string; onPress: () => void; busy?: boolean; disabled?: boolean}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityState={{disabled: disabled || busy, busy}} disabled={disabled || busy} onPress={onPress} style={({pressed}) => ({minHeight: 56, borderRadius: tokens.radius, backgroundColor: p.accent, padding: 16, justifyContent: 'center', opacity: pressed || disabled ? 0.6 : 1})}>{busy ? <ActivityIndicator accessibilityLabel="Please wait" color={p.onAccent}/> : <Text style={{color: p.onAccent, fontSize: 17, fontWeight: '600', textAlign: 'center'}}>{label}</Text>}</Pressable>;
}
export function Input({label, ...props}: TextInputProps & {label: string}) {
  const p = usePalette();
  return <View style={{gap: 8}}><Type>{label}</Type><TextInput accessibilityLabel={label} {...props} style={{borderWidth: 1, borderColor: p.line, borderRadius: tokens.radius, minHeight: 56, padding: 16, color: p.ink, fontSize: 17}} /></View>;
}
export function Notice({children}: React.PropsWithChildren) { return <View accessibilityLiveRegion="polite"><Type muted>{children}</Type></View>; }
