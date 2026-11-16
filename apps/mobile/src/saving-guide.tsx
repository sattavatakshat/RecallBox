import React from 'react';
import {Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useBrandTheme} from './brand';

/** Context only: opening help never requests permissions or launches a share. */
export function SavingGuide({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const p = useBrandTheme();
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}
    statusBarTranslucent navigationBarTranslucent>
    <View style={[styles.backdrop, {backgroundColor: p.scrim}]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss saving guide"
        onPress={onClose} style={StyleSheet.absoluteFill}/>
      <SafeAreaView pointerEvents="box-none" edges={['top', 'bottom', 'left', 'right']} style={styles.safe}>
        <View accessibilityViewIsModal style={[styles.sheet, {backgroundColor: p.surface}]}>
          <ScrollView contentContainerStyle={{gap: 20, padding: 24}}>
            <Text accessibilityRole="header" style={{color: p.primaryText, fontSize: 24,
              lineHeight: 31, fontWeight: '700'}}>How saving works</Text>
            <Text style={[styles.copy, {color: p.secondaryText}]}>
              {Platform.OS === 'android'
                ? '1. Open a link in another Android app and tap Share.'
                : '1. Open the content you want to keep in another app.'}
            </Text>
            <Text style={[styles.copy, {color: p.secondaryText}]}>
              2. If RecallBox appears in the share menu, select it to send the web link. Sign in if asked.
            </Text>
            <Text style={[styles.copy, {color: p.secondaryText}]}>
              3. Check your Library or Recently captured for the confirmed save and its status.
            </Text>
            <Text style={[styles.copy, {color: p.secondaryText}]}>
              Don’t see RecallBox? Copy the link, then use Save something → Paste a link.
              Add photos and PDFs from Save something or share supported files to RecallBox.
            </Text>
            <Text style={{color: p.secondaryText, fontSize: 14, lineHeight: 21}}>
              Share availability depends on the app and your installed build. The updated Android
              receiver supports web links, text, JPG/PNG/WebP images and PDFs up to 8 MiB each.
              Native shares are encrypted on this device until synced. In-app composer drafts still need a connection to save.
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Got it, close saving guide"
              onPress={onClose} style={({pressed}) => [styles.close, {backgroundColor: p.button,
                opacity: pressed ? 0.75 : 1}]}>
              <Text style={{color: p.onButton, fontSize: 17, lineHeight: 24, fontWeight: '600'}}>Got it</Text>
            </Pressable>
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: {flex: 1, justifyContent: 'flex-end'},
  safe: {flex: 1, justifyContent: 'flex-end', width: '100%', maxWidth: 480, alignSelf: 'center'},
  sheet: {borderRadius: 24, overflow: 'hidden', maxHeight: '92%'},
  copy: {fontSize: 16, lineHeight: 24},
  close: {minHeight: 52, borderRadius: 16, padding: 14, alignItems: 'center', justifyContent: 'center'},
});
