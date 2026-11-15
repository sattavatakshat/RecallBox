import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {Type, usePalette} from './ui';

/** RB-02: prototype empty-state hierarchy; no demo memories or simulated saves. */
export function EmptyLibrary({onSave, onCaptured}: {onSave: () => void; onCaptured: () => void}) {
  const p = usePalette();
  return <View style={{gap: 16}}>
    <View style={{minHeight: 260, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, gap: 10}}>
      <View importantForAccessibility="no-hide-descendants" style={{
        width: 82, height: 82, borderRadius: 25, backgroundColor: p.surfaceMuted,
        alignItems: 'center', justifyContent: 'center', transform: [{rotate: '-6deg'}],
      }}>
        <View style={{width: 34, height: 43, borderColor: p.accent, borderWidth: 2,
          borderTopLeftRadius: 4, borderTopRightRadius: 4, borderBottomWidth: 0}}/>
        <View style={{position: 'absolute', bottom: 18, width: 24, height: 24,
          borderColor: p.accent, borderTopWidth: 2, borderLeftWidth: 2,
          transform: [{rotate: '45deg'}]}}/>
      </View>
      <Type style={{fontFamily: 'serif', fontSize: 27, lineHeight: 32, textAlign: 'center'}}>
        Start with one thing.
      </Type>
      <Type muted style={{fontSize: 14, lineHeight: 22, textAlign: 'center'}}>
        Paste an interesting link, write a thought or add a file. No folders required.
      </Type>
      <Pressable accessibilityRole="button" accessibilityLabel="Save something"
        onPress={onSave} style={({pressed}) => ({
          alignSelf: 'stretch', minHeight: 49, borderRadius: 13, backgroundColor: p.accent,
          alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 9,
          opacity: pressed ? 0.75 : 1,
        })}>
        <Text style={{color: p.onAccent, fontSize: 19}}>＋</Text>
        <Text style={{color: p.onAccent, fontSize: 14, fontWeight: '700'}}>Save something</Text>
      </Pressable>
    </View>
    <Pressable accessibilityRole="button" accessibilityLabel="Open recently captured" onPress={onCaptured} style={{
      minHeight: 49, borderRadius: 13, borderWidth: 1, borderColor: p.line,
      backgroundColor: p.surface, paddingHorizontal: 12,
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <Text style={{color: p.ink, fontSize: 14}}>◷  Recently captured</Text>
      <Text style={{color: p.muted, fontSize: 11}}>View →</Text>
    </Pressable>
  </View>;
}
