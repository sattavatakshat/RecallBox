import {Image, View} from 'react-native';
import {usePalette, tokens} from './theme';
import {Type} from './ui';

/** Compatibility names now point to the single application design system. */
export {palettes as brandThemes, usePalette as useBrandTheme, useTypography as useBrandTypography} from './theme';

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
  const p = usePalette();
  return <View accessible accessibilityLabel="RecallBox" style={{flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: tokens.space.compact, maxWidth: '100%', flexShrink: 1}}>
    <BookmarkLogo size={logoSize} color={p.onBrand} background={p.brand}/>
    <Type variant="wordmark" style={{fontSize: wordmarkSize, flexShrink: 1}}>RecallBox</Type>
  </View>;
}

export function SavedCards() {
  return <Image source={require('../assets/welcome/saved-cards.png')}
    accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    accessibilityIgnoresInvertColors resizeMode="contain" style={{width: '100%', height: '100%'}}/>;
}
