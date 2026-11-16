import React from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {router} from 'expo-router';
import {Type, tokens, usePalette} from '../../src/ui';

type CaptureOption = {
  key: string; icon: string; title: string; subtitle: string; route:
    '/(account)/new-link' | '/(account)/new' | '/(account)/capture';
  method?: 'image' | 'pdf';
};

const options: CaptureOption[] = [
  {key: 'URL', icon: '↗', title: 'Paste a link', subtitle: 'Articles, websites and saved links', route: '/(account)/new-link'},
  {key: 'NOTE', icon: '✎', title: 'Write a note', subtitle: 'A thought or something to remember', route: '/(account)/new'},
  {key: 'IMG', icon: '▧', title: 'Photo or screenshot', subtitle: 'Choose a saved image or use the camera', route: '/(account)/capture', method: 'image'},
  {key: 'PDF', icon: '▤', title: 'File or document', subtitle: 'PDF documents up to 8 MiB', route: '/(account)/capture', method: 'pdf'},
];

/**
 * Reuse real capture flows. Replacing the sheet keeps it out of the composer's
 * back stack; cancelling a composer returns to its original destination.
 */
export default function SaveSomething() {
  const p = usePalette();
  return <View style={{flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.36)'}}>
    <Pressable accessibilityRole="button" accessibilityLabel="Close save options"
      onPress={() => router.back()} style={{position: 'absolute', top: 0, right: 0, bottom: 0, left: 0}}/>
    <SafeAreaView accessibilityViewIsModal edges={['bottom', 'left', 'right']} style={{
      backgroundColor: p.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28,
      overflow: 'hidden', width: '100%', maxWidth: 540, maxHeight: '90%', alignSelf: 'center',
      elevation: 8, shadowColor: '#000000', shadowOpacity: 0.2,
      shadowOffset: {width: 0, height: -4}, shadowRadius: 12,
    }}>
      <ScrollView contentContainerStyle={{paddingHorizontal: tokens.space.large, paddingTop: tokens.space.compact,
        paddingBottom: tokens.space.large, gap: tokens.space.small}}>
        <View importantForAccessibility="no-hide-descendants" style={{
          alignSelf: 'center', width: 38, height: 4, backgroundColor: p.line,
          borderRadius: tokens.radii.full, marginBottom: tokens.space.medium,
        }}/>
        <View style={{flexDirection: 'row', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: tokens.space.compact}}>
          <View style={{flex: 1, gap: 3}}>
            <Type variant="section">Save something</Type>
            <Type muted variant="caption">Keep it now. Organize it later.</Type>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close"
            onPress={() => router.back()} style={({pressed}) => ({
              minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center',
              backgroundColor: pressed ? p.surfaceMuted : 'transparent',
              borderRadius: tokens.radii.full,
            })}>
            <Text style={{fontSize: 25, color: p.muted}}>×</Text>
          </Pressable>
        </View>
        {options.map(item => <Pressable key={item.key}
          accessibilityRole="button" accessibilityLabel={item.title}
          onPress={() => router.replace(item.method
            ? {pathname: '/(account)/capture', params: {method: item.method}}
            : item.route)}
          style={({pressed}) => ({
            minHeight: 68, borderRadius: tokens.radii.medium,
            flexDirection: 'row', alignItems: 'center', gap: tokens.space.medium,
            paddingHorizontal: tokens.space.compact,
            backgroundColor: pressed ? p.surfaceMuted : 'transparent',
          })}>
          <View importantForAccessibility="no-hide-descendants" style={{
            width: 48, height: 48, borderRadius: tokens.radii.small,
            backgroundColor: p.surfaceMuted, alignItems: 'center', justifyContent: 'center',
          }}>
            <Text style={{color: p.accent, fontWeight: '700', fontSize: 24}}>
              {item.icon}
            </Text>
          </View>
          <View style={{flex: 1, gap: 2}}>
            <Type variant="label">{item.title}</Type>
            <Type muted variant="caption">{item.subtitle}</Type>
          </View>
          <Text style={{color: p.muted, fontSize: 20}}>›</Text>
        </Pressable>)}
        <Type variant="caption" muted style={{textAlign: 'center', marginTop: tokens.space.small}}>
          A connection is required. Files and links are marked saved only after confirmation.
        </Type>
      </ScrollView>
    </SafeAreaView>
  </View>;
}
