import React from 'react';
import {View} from 'react-native';

export function LibraryIcon({kind, color}: {kind: 'search' | 'note' | 'link' | 'image' | 'pdf'; color: string}) {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{width: 28, height: 28}}>
    {kind === 'search' ? <>
      <View style={{width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: color}}/>
      <View style={{position: 'absolute', width: 12, height: 2, left: 16, top: 21,
        backgroundColor: color, transform: [{rotate: '45deg'}]}}/>
    </> : kind === 'link' ? <>
      {[{left: 3, top: 10}, {left: 12, top: 0}].map((position, index) =>
        <View key={index} style={{position: 'absolute', ...position, width: 13, height: 19,
          borderWidth: 2, borderColor: color, borderRadius: 8, transform: [{rotate: '42deg'}]}}/>)}
      <View style={{position: 'absolute', width: 15, height: 2, left: 7, top: 13,
        backgroundColor: color, transform: [{rotate: '-48deg'}]}}/>
    </> : <>
      <View style={{position: 'absolute', left: 3, top: 1, width: 22, height: 26,
        borderWidth: 2, borderColor: color, borderRadius: 3}}/>
      {kind === 'image' ? <>
        <View style={{position: 'absolute', left: 8, top: 6, width: 5, height: 5,
          borderRadius: 3, borderWidth: 1.5, borderColor: color}}/>
        <View style={{position: 'absolute', left: 8, top: 17, width: 12, height: 8,
          borderTopWidth: 2, borderLeftWidth: 2, borderColor: color, transform: [{rotate: '45deg'}]}}/>
      </> : [9, 15, 21].map(top => <View key={top} style={{position: 'absolute', left: 8,
        top, width: top === 21 ? 8 : 12, height: 2, backgroundColor: color}}/>)}
    </>}
  </View>;
}
