import React from 'react';
import {Image, Platform, Text, View, useColorScheme} from 'react-native';
import {useFonts} from 'expo-font';
import {welcomeTheme, welcomeTokens} from './welcome-theme';

/** Shared RB-01/RB-02 identity; deliberately does not restyle legacy screens. */
export const brandThemes = {
  light: {...welcomeTheme.light, secondaryText: '#596B60', surface: '#FFFCF5',
    line: '#E1E4D8', selectedSurface: '#E5EDCD', selectedText: '#164A35',
    avatar: '#E5EDCD', onAvatar: '#204C37', scrim: 'rgba(4, 20, 12, 0.48)'},
  dark: {...welcomeTheme.dark, secondaryText: '#BDCCBC', surface: '#163427',
    line: '#2D4938', selectedSurface: '#254A31', selectedText: '#DCEC7C',
    avatar: '#C4DCAE', onAvatar: '#204C37', scrim: 'rgba(0, 10, 5, 0.68)'},
} as const;

export function useBrandTheme() {
  return useColorScheme() === 'dark' ? brandThemes.dark : brandThemes.light;
}

export function useBrandTypography() {
  const [loaded, error] = useFonts({
    DMSerifDisplay: require('../assets/welcome/DMSerifDisplay-Regular.ttf'),
  });
  return {ready: loaded || Boolean(error), fontFamily: loaded ? welcomeTokens.headlineFont :
    Platform.select({ios: 'Georgia', android: 'serif'})};
}

export function BookmarkLogo({size = 46, color, background}: {
  size?: number; color: string; background: string;
}) {
  const scale = size / 46;
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{width: size, height: size, borderRadius: 14 * scale,
      backgroundColor: background, alignItems: 'center', justifyContent: 'center'}}>
    <View style={{width: 19 * scale, height: 24 * scale, borderWidth: 2 * scale,
      borderColor: color, borderRadius: 3 * scale, borderBottomWidth: 0}}>
      <View style={{position: 'absolute', bottom: -scale, left: -scale,
        width: 11 * scale, height: 2 * scale, backgroundColor: color, transform: [{rotate: '-33deg'}]}}/>
      <View style={{position: 'absolute', bottom: -scale, right: -scale,
        width: 11 * scale, height: 2 * scale, backgroundColor: color, transform: [{rotate: '33deg'}]}}/>
    </View>
  </View>;
}

export function BrandLockup({logoSize = 46, wordmarkSize = 24}: {
  logoSize?: number; wordmarkSize?: number;
}) {
  const p = useBrandTheme();
  return <View accessible accessibilityLabel="RecallBox" style={{flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 11, maxWidth: '100%', flexShrink: 1}}>
    <BookmarkLogo size={logoSize} color={p.onBrand} background={p.brand}/>
    <Text style={{color: p.primaryText, fontSize: wordmarkSize, fontWeight: '700',
      letterSpacing: -0.8, flexShrink: 1}}>RecallBox</Text>
  </View>;
}

export function SavedCards() {
  return <Image source={require('../assets/welcome/saved-cards.png')}
    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    accessibilityIgnoresInvertColors resizeMode="contain" style={{width: '100%', height: '100%'}}/>;
}
