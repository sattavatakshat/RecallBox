import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {tokens, usePalette} from './ui';

type Destination = 'library' | 'search' | 'collections';

/** Native approximation of the prototype's 20px outlined icon set. */
function NavIcon({kind, color}: {kind: Destination; color: string}) {
  if (kind === 'search') {
    return <View style={{width: 20, height: 20}}>
      <View style={{position: 'absolute', left: 1, top: 1, width: 14, height: 14,
        borderWidth: 1.8, borderColor: color, borderRadius: 8}}/>
      <View style={{position: 'absolute', left: 13, top: 15, width: 8, height: 1.8,
        borderRadius: 1, backgroundColor: color, transform: [{rotate: '45deg'}]}}/>
    </View>;
  }
  if (kind === 'collections') {
    return <View style={{width: 20, height: 20}}>
      {[0, 5, 10].map((top, i) => <View key={i} style={{
        position: 'absolute', top, left: 4, width: 12, height: 9,
        transform: [{rotate: '45deg'}],
        borderTopWidth: 1.8, borderLeftWidth: 1.8,
        borderColor: color,
      }}/>)}
    </View>;
  }
  return <View style={{width: 20, height: 20, justifyContent: 'flex-end',
    flexDirection: 'row', alignItems: 'flex-end', gap: 3}}>
    {[15, 15, 15, 10].map((height, i) => <View key={i} style={{
      width: 2, height, backgroundColor: color, borderRadius: 1,
    }}/>)}
    <View style={{position: 'absolute', left: 0, bottom: 0,
      height: 1.8, width: 20, backgroundColor: color}}/>
  </View>;
}

function navigate(to: Destination) {
  if (to === 'library') router.replace('/(account)');
  else if (to === 'search') router.replace('/(account)/search');
  else router.replace('/(account)/collections');
}

/**
 * RB-06: exactly THREE tab destinations and a SEPARATE floating Save action.
 * Matching source: .navbar, .navtab and .fab in the committed HTML prototype.
 * Save must never be rendered as a fourth bottom destination.
 */
export function BottomNavigation({active}: {active: Destination}) {
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const activeSurface = p.paper === '#171E1A' ? '#334B3B' : '#E1E9DA';
  const tabs: Array<{key: Destination; label: string}> = [
    {key: 'library', label: 'Library'},
    {key: 'search', label: 'Search'},
    {key: 'collections', label: 'Collections'},
  ];
  return <>
    <SafeAreaView edges={['bottom']} style={{
      backgroundColor: p.paper, borderTopWidth: 1, borderColor: p.line,
    }}>
      <View style={{
        height: 70, maxWidth: tokens.width, width: '100%', alignSelf: 'center',
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 14, gap: 7, paddingTop: 9, paddingBottom: 12,
      }}>
        {tabs.map(tab => {
          const selected = active === tab.key;
          return <Pressable key={tab.key} accessibilityRole="tab"
            accessibilityLabel={tab.label} accessibilityState={{selected}}
            onPress={() => {if (!selected) navigate(tab.key);}}
            style={({pressed}) => ({
              flex: 1, minHeight: 44, borderRadius: 10, gap: 3,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: selected || pressed ? activeSurface : 'transparent',
            })}>
            <NavIcon kind={tab.key} color={selected ? p.accent : p.faint}/>
            <Text style={{
              fontSize: 10, lineHeight: 14, fontWeight: '600',
              color: selected ? p.accent : p.faint,
            }}>{tab.label}</Text>
          </Pressable>;
        })}
      </View>
    </SafeAreaView>
    <Pressable accessibilityRole="button" accessibilityLabel="Save something"
      onPress={() => router.push('/(account)/save')}
      style={({pressed}) => ({
        position: 'absolute', right: 16, bottom: insets.bottom + 81,
        zIndex: 5, elevation: 6,
        width: 53, height: 53, borderRadius: 19,
        backgroundColor: '#284D3B', alignItems: 'center', justifyContent: 'center',
        shadowColor: '#1B311E', shadowOpacity: 0.21,
        shadowRadius: 16, shadowOffset: {width: 0, height: 6},
        opacity: pressed ? 0.8 : 1,
      })}>
      <Text style={{color: '#FFFFFF', fontSize: 29, lineHeight: 33,
        fontWeight: '300', marginTop: -2}}>+</Text>
    </Pressable>
  </>;
}
