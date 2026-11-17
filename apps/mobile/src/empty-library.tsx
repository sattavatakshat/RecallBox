import {LoadingIndicator, Button, Icon, Type, tokens} from './ui';
import {useState} from 'react';
import {Pressable, RefreshControl, ScrollView, StyleSheet, View, useColorScheme, useWindowDimensions} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {SavedCards, useBrandTheme, useBrandTypography} from './brand';
import type {LibraryMode} from './library-state';
import type {MemorySummary} from './api';
import {useSession} from './session';
import {AppHeader} from './navigation-ui';

import {SavingGuide} from './saving-guide';

/** RB-02. This view never manufactures empty, saved, or processing data. */
export function EmptyLibrary({mode, captures, deviceShares, deviceError, error, notice, refreshing, onRefresh, onSave, onCaptured}: {
  mode: LibraryMode; captures: MemorySummary[]; error: string; notice: string;
  deviceShares: number; deviceError: string;
  refreshing: boolean; onRefresh: () => void; onSave: () => void; onCaptured: () => void;
}) {
  const p = useBrandTheme();
  const {fontFamily, ready} = useBrandTypography();
  const {account} = useSession();
  const {width, height, fontScale} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const dark = useColorScheme() === 'dark';
  const [guide, setGuide] = useState(false);
  const name = account?.display_name?.trim();
  const compact = height - insets.top - insets.bottom < 720 || fontScale > 1.3;
  const contentWidth = Math.min(width - insets.left - insets.right, 440);
  const artHeight = Math.min((contentWidth - 32) / 1.45, 238,
    Math.max(120, (height - insets.top - insets.bottom - 540) * 0.8)) /
    Math.min(Math.max(fontScale, 1), 1.6);
  const failed = captures.filter(item => item.processing_state === 'failed').length;
  const queued = captures.filter(item => item.processing_state === 'queued').length;
  const processing = captures.filter(item => item.processing_state === 'processing').length;
  const status = [queued && `${queued} queued`, processing && `${processing} processing`,
    failed && `${failed} ${failed === 1 ? 'needs' : 'need'} attention`,
    deviceShares && `${deviceShares} saved on this device`, deviceError && 'Device inbox needs attention']
    .filter(Boolean).join(' · ');
  const loading = mode === 'loading' || !ready;

  return <View style={[styles.root, {backgroundColor: p.background}]}>

    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.corner, {backgroundColor: p.decoration, opacity: dark ? 0.45 : 0.5}]}/>
    {/* The shared bottom navigation owns the bottom safe-area inset. */}
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <View style={styles.content}>
        <ScrollView style={styles.root} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={p.brand} colors={[p.brand]}/>}
          contentContainerStyle={[styles.body, {paddingTop: compact ? 16 : 28}]}>
          <AppHeader name={name} onAccount={() => router.push('/(account)/account')}/>
          <View style={{marginTop: compact ? 28 : 44, gap: tokens.space.tiny}}>
            <Type accessibilityRole="header" style={{color: p.primaryText, fontFamily,
              ...tokens.type.display, fontSize: Math.min(tokens.type.display.fontSize!, (contentWidth - 56) / 7.3)}}>Your library.</Type>
            <Type style={[styles.copy, {color: p.secondaryText}]}>
              Everything worth keeping, in one place.
            </Type>
          </View>
          {!!notice && <Type accessibilityLiveRegion="polite"
            style={[styles.status, {color: p.secondaryText, marginTop: tokens.space.medium}]}>{notice}</Type>}
          {loading ? <View style={styles.recovery}>
            <LoadingIndicator accessibilityLabel="Checking your Library" color={p.brand}/>
            <Type style={[styles.copy, {color: p.secondaryText}]}>Checking your Library…</Type>
          </View> : mode === 'error' ? <View style={styles.recovery}>
            <Type accessibilityRole="header" style={{fontFamily, ...tokens.type.editorHeading,
              color: p.primaryText}}>Your library couldn’t load.</Type>
            <Type accessibilityRole="alert" style={[styles.copy, {color: p.error}]}>{error}</Type>
            <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.quiet}>
              <Type style={[styles.quietText, {color: p.primaryText}]}>Try again</Type>
            </Pressable>
            <Type style={[styles.status, {color: p.secondaryText}]}>
              Saving needs a connection. Keep your input open until a save is confirmed.
            </Type>
          </View> : <View style={[styles.hero, {paddingTop: compact ? 24 : 32}]}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={{width: '100%', height: artHeight, alignItems: 'center', justifyContent: 'center'}}>
              <View style={{position: 'absolute', width: '88%', height: '82%', borderRadius: 180,
                backgroundColor: p.selectedSurface, opacity: dark ? 0.5 : 0.35}}/>
              <SavedCards/>
            </View>
            <Type accessibilityRole="header" style={{fontFamily, color: p.primaryText,
              ...tokens.type.editorHeading, fontSize: Math.min(tokens.type.editorHeading.fontSize!, (contentWidth - 56) / 10.2), textAlign: 'center', marginTop: compact ? 20 : 28}}>
              Start with one thing.
            </Type>
            <Type style={[styles.copy, {color: p.secondaryText, textAlign: 'center', marginTop: tokens.space.compact}]}>
              Save a link, screenshot or note.{'\n'}Find it here whenever you need it.
            </Type>
          </View>}
          {(captures.length > 0 || deviceShares > 0 || Boolean(deviceError)) && <Pressable accessibilityRole="button"
            accessibilityLabel={`Needs attention. ${status}. Open recovery${failed ? ' and retry options' : ''}`}
            onPress={onCaptured} style={({pressed}) => [styles.captureStatus,
              {borderColor: p.line, backgroundColor: p.surface, opacity: pressed ? 0.7 : 1}]}>
            <View style={{flex: 1, gap: tokens.space.tiny}}>
              <Type style={{color: p.primaryText, ...tokens.type.secondary,  fontWeight: '600'}}>Needs attention</Type>
              <Type style={[styles.status, {color: p.secondaryText}]}>{status}</Type>
              {failed > 0 && <Type style={[styles.status, {color: p.error}]}>View details and retry processing</Type>}
            </View>
            <Icon name="chevron"/>
          </Pressable>}
        </ScrollView>
        <View style={styles.actions}>
          <Button label="Save something" onPress={onSave} leading={<Icon name="save" color={p.onButton}/>}/>
          <Button label="How saving works" variant="quiet" onPress={() => setGuide(true)}/>
        </View>
      </View>
    </SafeAreaView>
    <SavingGuide visible={guide} onClose={() => setGuide(false)}/>
  </View>;
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    content: { flex: 1, maxWidth: tokens.geometry.emptyWidth, width: '100%', alignSelf: 'center' },
    body: { flexGrow: 1, paddingHorizontal: tokens.space.wide, paddingBottom: tokens.space.regular },
    copy: { ...tokens.type.body },
    status: { ...tokens.type.caption },
    hero: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: tokens.space.compact },
    recovery: { flexGrow: 1, gap: tokens.space.medium, justifyContent: 'center', paddingVertical: tokens.space.sectionSmall },
    captureStatus: { minHeight: 64, borderRadius: tokens.radii.medium, borderWidth: 1, padding: tokens.space.compact,
        flexDirection: 'row', alignItems: 'center', gap: tokens.space.compact, marginTop: tokens.space.medium },
    actions: { paddingHorizontal: tokens.space.wide, paddingTop: tokens.space.small, paddingBottom: tokens.space.tiny, gap: tokens.space.tiny },
    quiet: { minHeight: tokens.touch, padding: tokens.space.small, alignItems: 'center', justifyContent: 'center' },
    quietText: { ...tokens.type.secondary, fontWeight: '700', textAlign: 'center' },
    corner: { position: 'absolute', right: -85, top: -100, width: 170, height: 260,
        borderBottomLeftRadius: 150, transform: [{ rotate: '-16deg' }] }
});
