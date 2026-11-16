import React, {useState} from 'react';
import {ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
  useColorScheme, useWindowDimensions} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {StatusBar} from 'expo-status-bar';
import {router} from 'expo-router';
import {BrandLockup, SavedCards, useBrandTheme, useBrandTypography} from './brand';
import type {LibraryMode} from './library-state';
import type {MemorySummary} from './api';
import {useSession} from './session';
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
  const initials = name?.split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase();
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
    <StatusBar style={dark ? 'light' : 'dark'}/>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={[styles.corner, {backgroundColor: p.decoration, opacity: dark ? 0.45 : 0.5}]}/>
    {/* The shared bottom navigation owns the bottom safe-area inset. */}
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <View style={styles.content}>
        <ScrollView style={styles.root} showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={p.brand} colors={[p.brand]}/>}
          contentContainerStyle={[styles.body, {paddingTop: compact ? 16 : 28}]}>
          <View style={styles.header}>
            <BrandLockup logoSize={38} wordmarkSize={23}/>
            <Pressable accessibilityRole="button" accessibilityLabel={name
              ? `Account and settings for ${name}` : 'Account and settings'}
              onPress={() => router.push('/(account)/account')}
              style={({pressed}) => [styles.avatar, {backgroundColor: p.avatar, opacity: pressed ? 0.7 : 1}]}>
              {initials ? <Text maxFontSizeMultiplier={1.5} style={{color: p.onAvatar,
                fontSize: 21, fontWeight: '700'}}>{initials}</Text> :
                <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                  style={{alignItems: 'center', gap: 3}}>
                  <View style={{width: 9, height: 9, borderRadius: 5, borderWidth: 1.8, borderColor: p.onAvatar}}/>
                  <View style={{width: 18, height: 10, borderTopLeftRadius: 10, borderTopRightRadius: 10,
                    borderWidth: 1.8, borderBottomWidth: 0, borderColor: p.onAvatar}}/>
                </View>}
            </Pressable>
          </View>
          <View style={{marginTop: compact ? 28 : 44, gap: 6}}>
            <Text accessibilityRole="header" style={{color: p.primaryText, fontFamily,
              fontSize: Math.min(43, (contentWidth - 56) / 7.3), lineHeight: 53,
              letterSpacing: -0.8}}>Your library.</Text>
            <Text style={[styles.copy, {color: p.secondaryText}]}>
              Everything worth keeping, in one place.
            </Text>
          </View>
          {!!notice && <Text accessibilityLiveRegion="polite"
            style={[styles.status, {color: p.secondaryText, marginTop: 16}]}>{notice}</Text>}
          {loading ? <View style={styles.recovery}>
            <ActivityIndicator accessibilityLabel="Checking your Library" color={p.brand}/>
            <Text style={[styles.copy, {color: p.secondaryText}]}>Checking your Library…</Text>
          </View> : mode === 'error' ? <View style={styles.recovery}>
            <Text accessibilityRole="header" style={{fontFamily, fontSize: 28, lineHeight: 35,
              color: p.primaryText}}>Your library couldn’t load.</Text>
            <Text accessibilityRole="alert" style={[styles.copy, {color: p.error}]}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={onRefresh} style={styles.quiet}>
              <Text style={[styles.quietText, {color: p.primaryText}]}>Try again</Text>
            </Pressable>
            <Text style={[styles.status, {color: p.secondaryText}]}>
              Saving needs a connection. Keep your input open until a save is confirmed.
            </Text>
          </View> : <View style={[styles.hero, {paddingTop: compact ? 24 : 32}]}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
              style={{width: '100%', height: artHeight, alignItems: 'center', justifyContent: 'center'}}>
              <View style={{position: 'absolute', width: '88%', height: '82%', borderRadius: 180,
                backgroundColor: p.selectedSurface, opacity: dark ? 0.5 : 0.35}}/>
              <SavedCards/>
            </View>
            <Text accessibilityRole="header" style={{fontFamily, color: p.primaryText,
              fontSize: Math.min(32, (contentWidth - 56) / 10.2), lineHeight: 41,
              letterSpacing: -0.4, textAlign: 'center', marginTop: compact ? 20 : 28}}>
              Start with one thing.
            </Text>
            <Text style={[styles.copy, {color: p.secondaryText, textAlign: 'center', marginTop: 14}]}>
              Save a link, screenshot or note.{'\n'}Find it here whenever you need it.
            </Text>
          </View>}
          {(captures.length > 0 || deviceShares > 0 || Boolean(deviceError)) && <Pressable accessibilityRole="button"
            accessibilityLabel={`Recently captured. ${status}. Open capture status${failed ? ' and retry options' : ''}`}
            onPress={onCaptured} style={({pressed}) => [styles.captureStatus,
              {borderColor: p.line, backgroundColor: p.surface, opacity: pressed ? 0.7 : 1}]}>
            <View style={{flex: 1, gap: 4}}>
              <Text style={{color: p.primaryText, fontSize: 15, lineHeight: 21, fontWeight: '600'}}>Recently captured</Text>
              <Text style={[styles.status, {color: p.secondaryText}]}>{status}</Text>
              {failed > 0 && <Text style={[styles.status, {color: p.error}]}>View details and retry processing</Text>}
            </View>
            <Text accessible={false} style={{color: p.primaryText, fontSize: 25}}>›</Text>
          </Pressable>}
        </ScrollView>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="Save something" onPress={onSave}
            style={({pressed}) => [styles.save, {backgroundColor: p.button, opacity: pressed ? 0.75 : 1}]}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.plus}>
              <View style={{position: 'absolute', width: 23, height: 2, borderRadius: 1, backgroundColor: p.onButton}}/>
              <View style={{position: 'absolute', width: 2, height: 23, borderRadius: 1, backgroundColor: p.onButton}}/>
            </View>
            <Text style={{color: p.onButton, fontSize: 18, lineHeight: 25, fontWeight: '700', flexShrink: 1}}>Save something</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="How saving works" onPress={() => setGuide(true)}
            style={({pressed}) => [styles.quiet, {opacity: pressed ? 0.65 : 1}]}>
            <Text style={[styles.quietText, {color: dark ? p.accent : p.brand}]}>How saving works</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
    <SavingGuide visible={guide} onClose={() => setGuide(false)}/>
  </View>;
}

const styles = StyleSheet.create({
  root: {flex: 1},
  content: {flex: 1, maxWidth: 440, width: '100%', alignSelf: 'center'},
  body: {flexGrow: 1, paddingHorizontal: 28, paddingBottom: 20},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 16},
  avatar: {width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center'},
  copy: {fontSize: 16, lineHeight: 24},
  status: {fontSize: 13, lineHeight: 19},
  hero: {flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 12},
  recovery: {flexGrow: 1, gap: 16, justifyContent: 'center', paddingVertical: 32},
  captureStatus: {minHeight: 64, borderRadius: 16, borderWidth: 1, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 16},
  actions: {paddingHorizontal: 28, paddingTop: 8, paddingBottom: 4, gap: 4},
  save: {minHeight: 58, borderRadius: 18, paddingVertical: 14, paddingHorizontal: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10},
  plus: {width: 25, height: 25, alignItems: 'center', justifyContent: 'center'},
  quiet: {minHeight: 48, padding: 10, alignItems: 'center', justifyContent: 'center'},
  quietText: {fontSize: 15, lineHeight: 22, fontWeight: '700', textAlign: 'center'},
  corner: {position: 'absolute', right: -85, top: -100, width: 170, height: 260,
    borderBottomLeftRadius: 150, transform: [{rotate: '-16deg'}]},
});
