import React from 'react';
import {
  ActivityIndicator, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View,
  useColorScheme, useWindowDimensions,
} from 'react-native';
import {Redirect} from 'expo-router';
import {StatusBar} from 'expo-status-bar';
import {useFonts} from 'expo-font';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useSession} from './session';
import {useNativeLogin} from './use-native-login';
import {welcomeTheme, welcomeTokens as t} from './welcome-theme';

/** Small code-native brand mark; decorative and hidden from screen readers. */
function Bookmark({color, background}: {color: string; background: string}) {
  return <View style={[styles.logo, {backgroundColor: background}]}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <View style={{width: 19, height: 24, borderWidth: 2, borderColor: color,
      borderRadius: 3, borderBottomWidth: 0}}>
      <View style={{position: 'absolute', bottom: -1, left: -1, width: 11, height: 2,
        backgroundColor: color, transform: [{rotate: '-33deg'}]}}/>
      <View style={{position: 'absolute', bottom: -1, right: -1, width: 11, height: 2,
        backgroundColor: color, transform: [{rotate: '33deg'}]}}/>
    </View>
  </View>;
}

/** Shared by / and /sign-in. Authentication remains in the existing PKCE hook. */
export default function Welcome() {
  const session = useSession();
  const {login, busy, error, configured, googleSignIn} = useNativeLogin();
  const dark = useColorScheme() === 'dark';
  const p = dark ? welcomeTheme.dark : welcomeTheme.light;
  const {width, height, fontScale} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [fontsLoaded, fontError] = useFonts({
    DMSerifDisplay: require('../assets/welcome/DMSerifDisplay-Regular.ttf'),
  });
  const usableHeight = height - insets.top - insets.bottom;
  const compact = usableHeight < 680;
  const contentWidth = Math.min(width - insets.left - insets.right, t.contentWidth);
  // DM Serif Display's first line measures ~8.3 em with this tracking.
  // Keep both approved lines intact at default size; allow natural reflow with font scaling.
  const headlineSize = Math.min(43, (contentWidth - t.horizontalSpace * 2) / 8.4);
  const waiting = busy || session.loading;
  const message = error || session.message;
  const actionLabel = googleSignIn ? 'Continue with Google' : 'Continue securely';

  if (session.account) return <Redirect href="/(account)"/>;
  // Avoid briefly showing Welcome to an authenticated returning user.
  if (session.loading || (!fontsLoaded && !fontError)) return <View
    style={[styles.root, styles.center, {backgroundColor: p.background}]}>
    <StatusBar style={dark ? 'light' : 'dark'}/>
    <ActivityIndicator color={p.primaryText} accessibilityLabel="Restoring your session"/>
  </View>;

  return <View style={[styles.root, {backgroundColor: p.background}]}>
    <StatusBar style={dark ? 'light' : 'dark'}/>
    <View pointerEvents="none" accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <View style={[styles.topShape, {backgroundColor: p.decoration, opacity: dark ? 0.55 : 0.12}]}/>
      <View style={[styles.bottomShape, {backgroundColor: p.decoration, opacity: dark ? 0.45 : 0.7}]}/>
    </View>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.root}>
      <View style={styles.content}>
        <ScrollView style={styles.root} showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.body, {paddingTop: compact ? 24 : Math.min(56, usableHeight * 0.065)}]}>
          <View style={styles.brand} accessible accessibilityLabel="RecallBox">
            <Bookmark color={p.onBrand} background={p.brand}/>
            <Text style={[styles.wordmark, {color: p.primaryText}]}>RecallBox</Text>
          </View>
          <View style={{marginTop: compact ? 26 : 35, alignItems: 'center'}}>
            <Text accessibilityRole="header" style={{
              color: p.primaryText, fontFamily: fontsLoaded ? t.headlineFont :
                Platform.select({ios: 'Georgia', android: 'serif'}),
              fontSize: headlineSize, lineHeight: headlineSize * 1.15,
              letterSpacing: -1.1, textAlign: 'center', flexShrink: 1,
            }}>Save the good stuff.{'\n'}Find it again.</Text>
            <View pointerEvents="none" accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants" style={{
                width: Math.min(120 * fontScale, contentWidth * 0.44), height: 10,
                borderRadius: 8, backgroundColor: p.accent,
                transform: [{rotate: '-5deg'}], marginTop: 1,
                marginLeft: Math.min(78 * fontScale, contentWidth * 0.23),
              }}/>
          </View>
          <Text style={[styles.description, {color: p.secondaryText, marginTop: compact ? 18 : 24}]}>
            Links, screenshots, notes and ideas.{'\n'}One place to keep what matters.
          </Text>
          <View style={[styles.illustration, {marginTop: compact ? 18 : 25}]}
            accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Image source={require('../assets/welcome/saved-cards.png')}
              style={styles.art} resizeMode="contain" accessible={false}
              accessibilityIgnoresInvertColors/>
          </View>
        </ScrollView>
        <View style={[styles.footer, {paddingBottom: compact ? 20 : Math.min(58, usableHeight * 0.075)}]}>
          {!!message && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
            style={[styles.message, {color: error ? p.error : p.secondaryText}]}>{message}</Text>}
          {!configured && <Text style={[styles.message, {color: p.secondaryText}]}>
            Sign-in is temporarily unavailable. Please try again later.
          </Text>}
          <Pressable accessibilityRole="button" accessibilityLabel={actionLabel}
            accessibilityState={{disabled: waiting || !configured, busy: waiting}}
            disabled={waiting || !configured} onPress={() => void login()}
            style={({pressed}) => [styles.button, {backgroundColor: p.button,
              opacity: pressed || waiting || !configured ? 0.65 : 1}]}>
            {waiting ? <ActivityIndicator color={p.onButton} accessibilityLabel="Opening secure sign-in"/> :
              <View style={styles.buttonContent}>
                {googleSignIn && <View style={styles.googleDisc}
                  accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Image source={require('../assets/welcome/google-g.png')}
                    style={{width: 26, height: 26}} resizeMode="contain" accessible={false}/>
                </View>}
                <Text style={[styles.buttonText, {color: p.onButton, flexShrink: 1}]}>{actionLabel}</Text>
              </View>}
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
  root: {flex: 1},
  center: {alignItems: 'center', justifyContent: 'center'},
  content: {flex: 1, maxWidth: t.contentWidth, width: '100%', alignSelf: 'center'},
  body: {flexGrow: 1, alignItems: 'center', paddingHorizontal: t.horizontalSpace, paddingBottom: 20},
  brand: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11,
    maxWidth: '100%'},
  logo: {width: t.logoSize, height: t.logoSize, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center'},
  wordmark: {fontSize: 24, fontWeight: '700', letterSpacing: -0.8, flexShrink: 1},
  description: {fontSize: 17, lineHeight: 23, letterSpacing: -0.35, textAlign: 'center'},
  illustration: {width: '100%', aspectRatio: 1.4, flexGrow: 1, maxHeight: 290,
    minHeight: 140, justifyContent: 'center'},
  art: {width: '100%', height: '100%'},
  footer: {paddingHorizontal: t.horizontalSpace, paddingTop: 12},
  button: {minHeight: t.buttonHeight, borderRadius: t.buttonRadius,
    paddingHorizontal: 18, paddingVertical: 16, alignItems: 'center', justifyContent: 'center'},
  buttonText: {fontSize: 19, lineHeight: 26, fontWeight: '600', textAlign: 'center', letterSpacing: -0.4},
  buttonContent: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 11},
  googleDisc: {width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center'},
  message: {fontSize: 13, lineHeight: 19, textAlign: 'center', marginBottom: 12},
  topShape: {position: 'absolute', top: -95, right: -80, width: 195, height: 240,
    borderBottomLeftRadius: 140, transform: [{rotate: '-18deg'}]},
  bottomShape: {position: 'absolute', bottom: -85, left: -100, width: 205, height: 165,
    borderTopRightRadius: 120, transform: [{rotate: '26deg'}]},
});
