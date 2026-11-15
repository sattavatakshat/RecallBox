import React from 'react';
import {View} from 'react-native';
import {Button, Type, tokens, usePalette} from './ui';

/** Empty Library is a real first-save entry point, not a fake sample feed. */
export function EmptyLibrary({onSave}: {onSave: () => void}) {
  const p = usePalette();
  return <View style={{
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: tokens.space.section, paddingHorizontal: tokens.space.medium,
    gap: tokens.space.compact,
  }}>
    <View importantForAccessibility="no-hide-descendants" style={{
      width: 82, height: 82, borderRadius: 28,
      backgroundColor: p.surfaceMuted, alignItems: 'center', justifyContent: 'center',
      marginBottom: tokens.space.small,
    }}>
      <View style={{
        width: 32, height: 40, borderRadius: 6,
        borderWidth: 2, borderColor: p.accent,
      }}/>
      <View style={{
        width: 12, height: 12, backgroundColor: p.surfaceMuted,
        position: 'absolute', bottom: 21, left: 35,
        borderLeftWidth: 2, borderTopWidth: 2, borderColor: p.accent,
        transform: [{rotate: '45deg'}],
      }}/>
    </View>
    <Type variant="section" style={{textAlign: 'center'}}>
      A home for your discoveries.
    </Type>
    <Type muted style={{textAlign: 'center', maxWidth: 290}}>
      Save a useful link, a thought or a photo. Find it here whenever you need it.
    </Type>
    <View style={{alignSelf: 'stretch', marginTop: tokens.space.medium}}>
      <Button label="Save your first thing" onPress={onSave}/>
    </View>
    <Type muted variant="caption" style={{textAlign: 'center', marginTop: tokens.space.small}}>
      No folders or tags required.
    </Type>
  </View>;
}
