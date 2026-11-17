import {LoadingIndicator, Button, Type, tokens} from './ui';

import {Image, ScrollView, StyleSheet, View, useColorScheme, useWindowDimensions} from 'react-native';
import {Redirect} from 'expo-router';

import {usePalette, useTypography} from './theme';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {useSession} from './session';
import {useNativeLogin} from './use-native-login';
import {welcomeTokens as t} from './welcome-theme';
import {BrandLockup} from './brand';

/** Shared by / and /sign-in. Authentication remains in the existing PKCE hook. */
export default function Welcome() {
  const session = useSession();
  const {login, busy, error, configured, googleSignIn} = useNativeLogin();
  const dark = useColorScheme() === 'dark';
  const p = usePalette();
  const {width, height, fontScale} = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const {ready, fontFamily} = useTypography();
  const usableHeight = height - insets.top - insets.bottom;
  const compact = usableHeight < 680;
  const contentWidth = Math.min(width - insets.left - insets.right, t.contentWidth);
  // DM Serif Display's first line measures ~8.3 em with this tracking.
  // Keep both approved lines intact at default size; allow natural reflow with font scaling.
  const headlineSize = Math.min(tokens.type.hero.fontSize!, (contentWidth - t.horizontalSpace * 2) / 8.4);
  const waiting = busy || session.loading;
  const message = error || session.message;
  const actionLabel = googleSignIn ? 'Continue with Google' : 'Continue securely';

  if (session.account) return <Redirect href="/(account)"/>;
  // Avoid briefly showing Welcome to an authenticated returning user.
  if (session.loading || !ready) return <View
    style={[styles.root, styles.center, {backgroundColor: p.background}]}>

    <LoadingIndicator color={p.primaryText} accessibilityLabel="Restoring your session"/>
  </View>;

  return <View style={[styles.root, {backgroundColor: p.background}]}>

    <View pointerEvents="none" accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <View style={[styles.topShape, {backgroundColor: p.decoration, opacity: dark ? 0.55 : 0.12}]}/>
      <View style={[styles.bottomShape, {backgroundColor: p.decoration, opacity: dark ? 0.45 : 0.7}]}/>
    </View>
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.root}>
      <View style={styles.content}>
        <ScrollView style={styles.root} showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.body, {paddingTop: compact ? 24 : Math.min(56, usableHeight * 0.065)}]}>
          <BrandLockup/>
          <View style={{marginTop: compact ? 26 : 35, alignItems: 'center'}}>
            <Type variant="hero" accessibilityRole="header" style={{
              color: p.primaryText, fontFamily,
              fontSize: headlineSize, lineHeight: headlineSize * 1.15,
               textAlign: 'center', flexShrink: 1,
            }}>Save the good stuff.{'\n'}Find it again.</Type>
            <View pointerEvents="none" accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants" style={{
                width: Math.min(120 * fontScale, contentWidth * 0.44), height: 10,
                borderRadius: tokens.radii.small, backgroundColor: p.highlight,
                transform: [{rotate: '-5deg'}], marginTop: tokens.space.none,
                marginLeft: Math.min(78 * fontScale, contentWidth * 0.23),
              }}/>
          </View>
          <Type style={[styles.description, {color: p.secondaryText, marginTop: compact ? 18 : 24}]}>
            Links, screenshots, notes and ideas.{'\n'}One place to keep what matters.
          </Type>
          <View style={[styles.illustration, {marginTop: compact ? 18 : 25}]}
            accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Image source={require('../assets/welcome/saved-cards.png')}
              style={styles.art} resizeMode="contain" accessible={false}
              accessibilityIgnoresInvertColors/>
          </View>
        </ScrollView>
        <View style={[styles.footer, {paddingBottom: compact ? 20 : Math.min(58, usableHeight * 0.075)}]}>
          {!!message && <Type accessibilityRole="alert" accessibilityLiveRegion="polite"
            style={[styles.message, {color: error ? p.error : p.secondaryText}]}>{message}</Type>}
          {!configured && <Type style={[styles.message, {color: p.secondaryText}]}>
            Sign-in is temporarily unavailable. Please try again later.
          </Type>}
          <Button label={actionLabel} onPress={() => void login()} busy={waiting} disabled={!configured} size="hero"
            leading={googleSignIn ? <View style={[styles.googleDisc,{backgroundColor:p.identitySurface}]}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Image source={require('../assets/welcome/google-g.png')} style={{width:26,height:26}} resizeMode="contain" accessible={false}/>
            </View> : undefined}/>

        </View>
      </View>
    </SafeAreaView>
  </View>;
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    center: { alignItems: 'center', justifyContent: 'center' },
    content: { flex: 1, maxWidth: t.contentWidth, width: '100%', alignSelf: 'center' },
    body: { flexGrow: 1, alignItems: 'center', paddingHorizontal: t.horizontalSpace, paddingBottom: tokens.space.regular },
    description: { ...tokens.type.welcomeCopy, textAlign: 'center' },
    illustration: { width: '100%', aspectRatio: 1.4, flexGrow: 1, maxHeight: 290,
        minHeight: 140, justifyContent: 'center' },
    art: { width: '100%', height: '100%' },
    footer: { paddingHorizontal: t.horizontalSpace, paddingTop: tokens.space.compact },
    googleDisc: { width: 32, height: 32, borderRadius: tokens.radii.medium,
        alignItems: 'center', justifyContent: 'center' },
    message: { ...tokens.type.caption, textAlign: 'center', marginBottom: tokens.space.compact },
    topShape: { position: 'absolute', top: -95, right: -80, width: 195, height: 240,
        borderBottomLeftRadius: 140, transform: [{ rotate: '-18deg' }] },
    bottomShape: { position: 'absolute', bottom: -85, left: -100, width: 205, height: 165,
        borderTopRightRadius: 120, transform: [{ rotate: '26deg' }] }
});
