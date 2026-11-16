import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {tokens, usePalette} from './ui';
import {useBrandTheme} from './brand';

export type Destination = 'library' | 'search' | 'collections';

/** Code-native outline strokes keep the three tab icons consistent. */
function Stroke({from, to, color}: {from: [number, number]; to: [number, number]; color: string}) {
  const dx = to[0] - from[0], dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return <View style={{position: 'absolute', left: (from[0] + to[0] - length) / 2,
    top: (from[1] + to[1]) / 2 - 1, width: length, height: 2, borderRadius: 1,
    backgroundColor: color, transform: [{rotate: `${Math.atan2(dy, dx) * 180 / Math.PI}deg`}]}}/>;
}

function NavIcon({kind, color}: {kind: Destination; color: string}) {
  if (kind === 'search') return <View style={{width: 32, height: 32}}>
    <View style={{position: 'absolute', left: 3, top: 2, width: 20, height: 20,
      borderWidth: 2, borderColor: color, borderRadius: 10}}/>
    <Stroke from={[21, 21]} to={[29, 29]} color={color}/>
  </View>;
  return <View style={{width: 32, height: 32}}>
    <Stroke from={[1, 9]} to={[16, 2]} color={color}/>
    <Stroke from={[16, 2]} to={[31, 9]} color={color}/>
    <Stroke from={[31, 9]} to={[16, 16]} color={color}/>
    <Stroke from={[16, 16]} to={[1, 9]} color={color}/>
    <Stroke from={[1, 17]} to={[16, 24]} color={color}/>
    <Stroke from={[16, 24]} to={[31, 17]} color={color}/>
    {kind === 'collections' && <>
      <Stroke from={[1, 24]} to={[16, 31]} color={color}/>
      <Stroke from={[16, 31]} to={[31, 24]} color={color}/>
    </>}
  </View>;
}

function navigate(to: Destination) {
  // Keep real stack history and reuse a destination already in the stack.
  // Hardware Back from a tab reached through Library can return to Library.
  if (to === 'library') router.dismissTo('/(account)');
  else if (to === 'search') router.navigate('/(account)/search');
  else router.navigate('/(account)/collections');
}

/** Only a populated/filtered Library (or another destination) needs the FAB. */
export function BottomNavigation({active, showSave = true, approved = false}: {
  active: Destination; showSave?: boolean; approved?: boolean;
}) {
  const legacy = usePalette();
  const brand = useBrandTheme();
  const insets = useSafeAreaInsets();
  const [barHeight, setBarHeight] = useState(70);
  const background = approved ? brand.background : legacy.paper;
  const line = approved ? brand.line : legacy.line;
  const selectedSurface = approved ? brand.selectedSurface : legacy.surfaceMuted;
  const selectedInk = approved ? brand.selectedText : legacy.accent;
  const muted = approved ? brand.secondaryText : legacy.faint;
  const tabs: Array<{key: Destination; label: string}> = [
    {key: 'library', label: 'Library'},
    {key: 'search', label: 'Search'},
    {key: 'collections', label: 'Collections'},
  ];
  return <>
    <SafeAreaView edges={['bottom', 'left', 'right']}
      style={{backgroundColor: background, borderTopWidth: 1, borderColor: line}}>
      <View accessibilityRole="tablist" onLayout={event => setBarHeight(event.nativeEvent.layout.height)} style={{
        minHeight: 70, maxWidth: tokens.width, width: '100%', alignSelf: 'center',
        flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: 12,
        gap: 4, paddingTop: 6, paddingBottom: 6,
      }}>
        {tabs.map(tab => {
          const selected = active === tab.key;
          return <Pressable key={tab.key} accessibilityRole="tab"
            accessibilityLabel={tab.label} accessibilityState={{selected}}
            onPress={() => {if (!selected) navigate(tab.key);}}
            style={{flex: 1, minHeight: 58, alignItems: 'center', justifyContent: 'center', gap: 2}}>
            {({pressed}) => <>
              <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
                style={{minHeight: 34, width: '85%', maxWidth: 86, borderRadius: 24,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: selected || pressed ? selectedSurface : 'transparent'}}>
                <NavIcon kind={tab.key} color={selected ? selectedInk : muted}/>
              </View>
              <Text style={{fontSize: 12, lineHeight: 17, fontWeight: selected ? '700' : '400',
                textAlign: 'center', color: selected ? selectedInk : muted}}>{tab.label}</Text>
            </>}
          </Pressable>;
        })}
      </View>
    </SafeAreaView>
    {showSave && <Pressable accessibilityRole="button" accessibilityLabel="Save something"
      onPress={() => router.push('/(account)/save')}
      style={({pressed}) => ({
        position: 'absolute', right: 16, bottom: insets.bottom + barHeight + 11,
        zIndex: 5, elevation: 6, width: 53, height: 53, borderRadius: 19,
        backgroundColor: '#284D3B', alignItems: 'center', justifyContent: 'center',
        shadowColor: '#1B311E', shadowOpacity: 0.21, shadowRadius: 16,
        shadowOffset: {width: 0, height: 6}, opacity: pressed ? 0.8 : 1,
      })}>
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
        style={{width: 25, height: 25, alignItems: 'center', justifyContent: 'center'}}>
        <View style={{position: 'absolute', width: 24, height: 2, backgroundColor: '#FFFFFF', borderRadius: 1}}/>
        <View style={{position: 'absolute', height: 24, width: 2, backgroundColor: '#FFFFFF', borderRadius: 1}}/>
      </View>
    </Pressable>}
  </>;
}
