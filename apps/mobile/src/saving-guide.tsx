import {Modal, Platform, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useBrandTheme} from './brand';
import {Button, Type, SheetSurface, tokens} from './ui';

/** Context only: opening help never requests permissions or launches a share. */
export function SavingGuide({visible, onClose}: {visible: boolean; onClose: () => void}) {
  const p = useBrandTheme();
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}
    statusBarTranslucent navigationBarTranslucent>
    <View style={[styles.backdrop, {backgroundColor: p.scrim}]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss saving guide"
        onPress={onClose} style={StyleSheet.absoluteFill}/>
      <SafeAreaView pointerEvents="box-none" edges={['top', 'bottom', 'left', 'right']} style={styles.safe}>
        <SheetSurface style={{maxHeight:'92%'}}>
          <ScrollView contentContainerStyle={{gap: tokens.space.regular, padding: tokens.space.large}}>
            <Type variant="section">How saving works</Type>
            <Type style={[styles.copy, {color: p.secondaryText}]}>
              {Platform.OS === 'android'
                ? '1. Open a link in another Android app and tap Share.'
                : '1. Open the content you want to keep in another app.'}
            </Type>
            <Type style={[styles.copy, {color: p.secondaryText}]}>
              2. If RecallBox appears in the share menu, select it to send the web link. Sign in if asked.
            </Type>
            <Type style={[styles.copy, {color: p.secondaryText}]}>
              3. Find your confirmed save in Library. Source details can continue processing there.
            </Type>
            <Type style={[styles.copy, {color: p.secondaryText}]}>
              Don’t see RecallBox? Copy the link, then use Save something → Paste a link.
              Add photos and PDFs from Save something or share supported files to RecallBox.
            </Type>
            <Type style={{color: p.secondaryText, ...tokens.type.secondary, }}>
              Share availability depends on the app and your installed build. The updated Android
              receiver supports web links, text, JPG/PNG/WebP images and PDFs up to 8 MiB each.
              Native shares are encrypted on this device until synced. In-app composer drafts still need a connection to save.
            </Type>
            <Button label="Got it" accessibilityLabel="Got it, close saving guide" onPress={onClose}/>

          </ScrollView>
        </SheetSurface>
      </SafeAreaView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    safe: { flex: 1, justifyContent: 'flex-end', width: '100%', maxWidth: tokens.geometry.editorWidth, alignSelf: 'center' },
    copy: { ...tokens.type.body }
});
