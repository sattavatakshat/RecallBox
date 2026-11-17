import React, {memo} from 'react';
import {Pressable, Text, View} from 'react-native';
import type {MemorySummary} from './api';
import {useBrandTheme} from './brand';
import {LibraryIcon} from './library-icons';

function humanTitle(memory: MemorySummary) {
  return memory.title.trim() || (memory.kind === 'note' ? 'Untitled note' :
    memory.kind === 'image' ? 'Saved image' : memory.kind === 'pdf' ? 'Saved PDF' : 'Saved link');
}
function sourceName(memory: MemorySummary) {
  if (memory.kind === 'note') return 'Your note';
  if (memory.kind === 'image') return 'Image';
  if (memory.kind === 'pdf') return 'PDF';
  const match = /^https?:\/\/([^/?#]+)/i.exec(memory.source_url || memory.preview);
  return match?.[1]?.replace(/^www\./, '') ?? 'Saved link';
}
function shortDate(iso: string) {
  const date = new Date(iso), today = new Date();
  if (Number.isNaN(date.getTime())) return '';
  const localDay = (value: Date) => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
  const days = (localDay(today) - localDay(date)) / 86400000;
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, days > 1 && days < 7 ? {weekday: 'long'} :
    {day: 'numeric', month: 'short', ...(date.getFullYear() !== today.getFullYear() ? {year: 'numeric'} : {})});
}

/** No thumbnail API exists: show content icons instead of arbitrary images or full-size originals. */
export const MemoryCard = memo(function MemoryCard({memory, onOpen, onStar, busy = false}: {
  memory: MemorySummary; onOpen: () => void; onStar: () => void; busy?: boolean;
}) {
  const p = useBrandTheme();
  const kind = memory.kind === 'url' ? 'link' : memory.kind;
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, minHeight: 80}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${humanTitle(memory)}`}
      onPress={onOpen} style={({pressed}) => ({flex: 1, flexDirection: 'row', alignItems: 'center',
        gap: 16, minHeight: 60, opacity: pressed ? 0.7 : 1})}>
      <View style={{width: 60, height: 60, borderRadius: 14, backgroundColor: p.avatar,
        alignItems: 'center', justifyContent: 'center'}}>
        <LibraryIcon kind={kind} color={p.onAvatar}/>
      </View>
      <View style={{flex: 1, gap: 4}}>
        <Text numberOfLines={2} style={{color: p.primaryText, fontSize: 16, lineHeight: 21,
          fontWeight: '700', letterSpacing: -0.3}}>{humanTitle(memory)}</Text>
        <Text numberOfLines={1} style={{color: p.secondaryText, fontSize: 13, lineHeight: 19}}>
          {[sourceName(memory), shortDate(memory.created_at)].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel={`${memory.starred ? 'Unstar' : 'Star'} ${humanTitle(memory)}`}
      accessibilityState={{selected: memory.starred, disabled: busy, busy}} disabled={busy} onPress={onStar}
      style={({pressed}) => ({width: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center',
        opacity: busy || pressed ? 0.5 : 1})}>
      <Text accessible={false} style={{fontSize: 30, lineHeight: 38,
        color: memory.starred ? '#D99A26' : p.primaryText}}>{memory.starred ? '★' : '☆'}</Text>
    </Pressable>
  </View>;
});
