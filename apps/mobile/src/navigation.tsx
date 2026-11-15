import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {tokens, usePalette} from './ui';

type Destination = 'library' | 'search' | 'collections';
type NavigationIcon = Destination;

/**
 * Dependency-free, outlined navigation icons.
 * These shapes avoid introducing native modules into the already working APK.
 */
function NavIcon({kind, color}: {kind: NavigationIcon; color: string}) {
  if (kind === 'search') {
    return <View style={{width: 25, height: 25}}>
      <View style={{position: 'absolute', left: 2, top: 2, width: 16, height: 16,
        borderWidth: 2, borderColor: color, borderRadius: 10}}/>
      <View style={{position: 'absolute', left: 16, top: 17, width: 9, height: 2,
        borderRadius: 1, backgroundColor: color, transform: [{rotate: '45deg'}]}}/>
    </View>;
  }
  if (kind === 'collections') {
    return <View style={{width: 25, height: 25}}>
      <View style={{position: 'absolute', left: 3, top: 3, height: 17, width: 18,
        borderWidth: 2, borderColor: color, borderRadius: 3}}/>
      <View style={{position: 'absolute', left: 0, top: 7, height: 16, width: 19,
        borderWidth: 2, borderColor: color, backgroundColor: 'transparent', borderRadius: 3}}/>
    </View>;
  }
  return <View style={{width: 25, height: 25}}>
    <View style={{position: 'absolute', left: 4, top: 2, height: 19, width: 17,
      borderWidth: 2, borderColor: color, borderRadius: 3}}/>
    <View style={{position: 'absolute', left: 1, top: 5, height: 19, width: 17,
      borderWidth: 2, borderColor: color, borderRadius: 3}}/>
  </View>;
}

function go(to: Destination) {
  if (to === 'library') router.replace('/(account)');
  else if (to === 'search') router.replace('/(account)/search');
  else router.replace('/(account)/collections');
}

export function BottomNavigation({active}: {active: Destination}) {
  const p = usePalette();
  const tabs: Array<{key: Destination; label: string}> = [
    {key: 'library', label: 'Library'},
    {key: 'search', label: 'Search'},
    {key: 'collections', label: 'Collections'},
  ];
  return <SafeAreaView edges={['bottom']} style={{
    backgroundColor: p.surface, borderTopWidth: 1, borderColor: p.line,
  }}>
    <View style={{height: 72, maxWidth: tokens.width, width: '100%', alignSelf: 'center',
      flexDirection: 'row', alignItems: 'center', paddingHorizontal: tokens.space.small}}>
      {tabs.map(tab => {
        const selected = active === tab.key;
        return <Pressable key={tab.key} accessibilityRole="tab"
          accessibilityLabel={tab.label} accessibilityState={{selected}}
          onPress={() => {if (!selected) go(tab.key);}}
          style={({pressed}) => ({
            flex: 1, minHeight: tokens.touch, justifyContent: 'center', alignItems: 'center',
            borderRadius: tokens.radii.small, gap: 3,
            backgroundColor: pressed ? p.surfaceMuted : 'transparent',
          })}>
          <NavIcon kind={tab.key} color={selected ? p.accent : p.muted}/>
          <Text style={{color: selected ? p.accent : p.muted, fontSize: 11,
            lineHeight: 16, fontWeight: selected ? '700' : '500'}}>{tab.label}</Text>
        </Pressable>;
      })}
      <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', height: 72}}>
        <Pressable accessibilityRole="button" accessibilityLabel="Save something"
          onPress={() => router.push('/(account)/save')}
          style={({pressed}) => ({
            width: 53, height: 53, borderRadius: 27, alignItems: 'center',
            justifyContent: 'center', backgroundColor: p.accent, marginTop: -16,
            borderWidth: 2, borderColor: p.surface,
            opacity: pressed ? 0.8 : 1,
            elevation: 4, shadowColor: '#000000', shadowOpacity: 0.12,
            shadowOffset: {width: 0, height: 3}, shadowRadius: 6,
          })}>
          <Text style={{color: p.onAccent, fontSize: 28, fontWeight: '300',
            lineHeight: 33, marginTop: -3}}>+</Text>
        </Pressable>
        <Text style={{color: p.ink, fontSize: 11, lineHeight: 15, fontWeight: '700',
          marginTop: -1}}>Save</Text>
      </View>
    </View>
  </SafeAreaView>;
}
