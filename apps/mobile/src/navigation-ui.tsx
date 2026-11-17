
import {Pressable, View} from 'react-native';
import {BrandLockup} from './brand';
import {Icon, Type, tokens, usePalette} from './ui';

export function AccountAvatar({name, onPress}: {name?: string | null; onPress: () => void}) {
  const p = usePalette();
  const initials = name?.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toLocaleUpperCase();
  return <Pressable accessibilityRole="button" accessibilityLabel={name ? `Account and settings for ${name}` : 'Account and settings'}
    onPress={onPress} style={({pressed}) => ({width: tokens.touch, minHeight: tokens.touch,
      borderRadius: tokens.radii.full, backgroundColor: p.avatar, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1})}>
    {initials ? <Type variant="avatar" maxFontSizeMultiplier={1.5} style={{color: p.onAvatar}}>{initials}</Type> :
      <Icon name="account" color={p.onAvatar}/>}
  </Pressable>;
}
export function AppHeader({name, onAccount}: {name?: string | null; onAccount: () => void}) {
  return <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tokens.space.medium}}>
    <BrandLockup logoSize={40} wordmarkSize={22}/><AccountAvatar name={name} onPress={onAccount}/>
  </View>;
}
