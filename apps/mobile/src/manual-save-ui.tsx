import React from 'react';
import {ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet,
  Text, TextInput, View, type TextInputProps} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useBrandTheme, useBrandTypography} from './brand';
import {CaptureIcon} from './manual-save-icons';

export function CaptureEditor({title,subtitle,onCancel,busy,children}: React.PropsWithChildren<{
  title: string; subtitle: string; onCancel: () => void; busy: boolean;
}>) {
  const p=useBrandTheme();const {fontFamily}=useBrandTypography();
  return <SafeAreaView style={{flex:1,backgroundColor:p.background}}>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.editor}>
        <View style={{flexDirection:'row',alignItems:'center',gap:12}}>
          <Text accessibilityRole="header" style={{fontFamily,color:p.primaryText,fontSize:32,
            lineHeight:40,flex:1}}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Cancel capture" disabled={busy}
            onPress={onCancel} style={({pressed}) => ({minWidth:48,minHeight:48,
              alignItems:'center',justifyContent:'center',opacity:busy?0.4:pressed?0.6:1})}>
            <CaptureIcon kind="close" color={p.primaryText}/>
          </Pressable>
        </View>
        <Text style={{color:p.secondaryText,fontSize:16,lineHeight:24}}>{subtitle}</Text>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
export function CaptureInput({label,...props}: TextInputProps & {label: string}) {
  const p=useBrandTheme();
  return <View style={{gap:8}}>
    <Text style={{color:p.primaryText,fontSize:15,lineHeight:22,fontWeight:'600'}}>{label}</Text>
    <TextInput {...props} accessibilityLabel={label} placeholderTextColor={p.secondaryText}
      selectionColor={p.brand} style={[{minHeight:54,borderWidth:1,borderColor:p.line,
        backgroundColor:p.surface,borderRadius:16,padding:16,color:p.primaryText,
        fontSize:16,lineHeight:24},props.style]}/>
  </View>;
}
export function CaptureButton({label,onPress,busy=false,disabled=false,quiet=false}: {
  label: string; onPress: () => void; busy?: boolean; disabled?: boolean; quiet?: boolean;
}) {
  const p=useBrandTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{disabled:busy||disabled,busy}} disabled={busy||disabled} onPress={onPress}
    style={({pressed}) => ({minHeight:quiet?48:56,borderRadius:16,padding:14,
      alignItems:'center',justifyContent:'center',backgroundColor:quiet?'transparent':p.button,
      opacity:disabled?0.5:pressed?0.7:1})}>
    {busy?<ActivityIndicator color={quiet?p.primaryText:p.onButton} accessibilityLabel="Please wait"/>:
      <Text style={{color:quiet?p.primaryText:p.onButton,fontSize:17,lineHeight:24,
        textAlign:'center',fontWeight:'600'}}>{label}</Text>}
  </Pressable>;
}
export function CaptureMessage({children,error=false}: React.PropsWithChildren<{error?: boolean}>) {
  const p=useBrandTheme();
  return <Text accessibilityRole={error?'alert':undefined} accessibilityLiveRegion="polite"
    style={{color:error?p.error:p.secondaryText,fontSize:14,lineHeight:21}}>{children}</Text>;
}
const styles=StyleSheet.create({editor:{flexGrow:1,maxWidth:480,width:'100%',alignSelf:'center',
  padding:24,gap:20,paddingBottom:40}});
