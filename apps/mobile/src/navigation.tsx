import {useState} from 'react';
import {Pressable, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {Icon, Type, tokens, usePalette} from './ui';
export type Destination = 'library' | 'search' | 'collections';
function navigate(to: Destination) {
  if (to === 'library') router.dismissTo('/(account)');
  else if (to === 'search') router.navigate('/(account)/search');
  else router.navigate('/(account)/collections');
}
export function FloatingSaveButton({bottom}: {bottom: number}) {
  const p = usePalette();
  return <Pressable accessibilityRole="button" accessibilityLabel="Save something"
    onPress={() => router.push('/(account)/save')} style={({pressed}) => ({position: 'absolute',
      right: tokens.space.medium, bottom, zIndex: 5, width: tokens.geometry.fab, height: tokens.geometry.fab,
      borderRadius: tokens.radii.button, backgroundColor: p.button, alignItems: 'center', justifyContent: 'center',
      shadowColor: p.shadow, ...tokens.elevation.floating, opacity: pressed ? 0.8 : 1})}>
    <Icon name="save" size={tokens.geometry.iconLarge} color={p.onButton}/>
  </Pressable>;
}
/** approved remains accepted for compatibility; all destinations now use one theme. */
export function BottomNavigation({active, showSave = true, onActivePress}: {onActivePress?: () => void; active: Destination; showSave?: boolean; approved?: boolean}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const [barHeight, setBarHeight] = useState(tokens.geometry.navHeight);
  const tabs: Array<{key: Destination; label: string}> = [
    {key: 'library', label: 'Library'}, {key: 'search', label: 'Search'}, {key: 'collections', label: 'Collections'},
  ];
  return <>
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{backgroundColor: p.background, borderTopWidth: tokens.geometry.divider, borderColor: p.line}}>
      <View accessibilityRole="tablist" onLayout={event => setBarHeight(event.nativeEvent.layout.height)} style={{
        minHeight: tokens.geometry.navHeight, maxWidth: tokens.width, width: '100%', alignSelf: 'center',
        flexDirection: 'row', paddingHorizontal: tokens.space.compact, gap: tokens.space.tiny, paddingVertical: tokens.space.small}}>
        {tabs.map(tab => {
          const selected = active === tab.key;
          return <Pressable key={tab.key} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{selected}}
            onPress={() => {if (!selected) navigate(tab.key); else onActivePress?.();}} style={{flex: 1, minHeight: tokens.touch,
              alignItems: 'center', justifyContent: 'center', gap: tokens.space.tiny}}>
            {({pressed}) => <>
              <View style={{minHeight: tokens.space.sectionSmall, width: '85%', maxWidth: 88, borderRadius: tokens.radii.full,
                alignItems: 'center', justifyContent: 'center', backgroundColor: selected || pressed ? p.selectedSurface : 'transparent'}}>
                <Icon name={tab.key} size={tokens.geometry.iconLarge} color={selected ? p.selectedText : p.primaryText}/>
              </View>
              <Type variant="nav" style={{textAlign: 'center', color: selected ? p.selectedText : p.primaryText,
                fontWeight: selected ? tokens.type.cardTitle.fontWeight : tokens.type.nav.fontWeight}}>{tab.label}</Type>
            </>}
          </Pressable>;
        })}
      </View>
    </SafeAreaView>
    {showSave && <FloatingSaveButton bottom={insets.bottom + barHeight + tokens.space.compact}/>}
  </>;
}
