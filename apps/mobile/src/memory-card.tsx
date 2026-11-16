import React from 'react';
import {Pressable, Text, View} from 'react-native';
import type {MemorySummary} from './api';
import {IconButton, Type, usePalette} from './ui';

function kindLabel(memory: MemorySummary) {
  if (memory.kind === 'note') return 'NOTE';
  if (memory.kind === 'pdf') return 'PDF';
  if (memory.kind === 'image') return 'PHOTO';
  return 'LINK';
}

function humanTitle(memory: MemorySummary) {
  if (memory.title.trim()) return memory.title;
  if (memory.kind === 'note') return 'Untitled note';
  if (memory.kind === 'image') return 'Saved photo';
  if (memory.kind === 'pdf') return 'Saved PDF';
  return 'Saved link';
}

function sourceName(memory: MemorySummary) {
  if (memory.kind === 'note') return 'Your note';
  if (memory.kind === 'image') return 'Image';
  if (memory.kind === 'pdf') return 'PDF';
  const raw = memory.source_url || memory.preview;
  const match = /^https?:\/\/([^/?#]+)/i.exec(raw);
  return match?.[1]?.replace(/^www\./, '') ?? 'Saved link';
}

function shortDate(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString(undefined, {day: 'numeric', month: 'short'});
}

/**
 * Compact recognizable Library row. Uses real saved fields only.
 * The API does not provide thumb-sized assets, so we deliberately show a
 * source-type tile instead of downloading original-size media for a tiny card.
 */
export function MemoryCard({memory, onOpen, onStar, busy = false}: {
  memory: MemorySummary;
  onOpen: () => void;
  onStar: () => void;
  busy?: boolean;
}) {
  const p = usePalette();
  const meta = [kindLabel(memory), sourceName(memory)].filter(Boolean).join(' · ');
  const effectiveTopic = memory.topic_override === 'Uncategorized'
    ? null : (memory.topic_override ?? memory.suggested_topic ?? null);
  const detail = [effectiveTopic, shortDate(memory.created_at), memory.collection]
    .filter(Boolean).join(' · ');
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: p.line, minHeight: 82}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${humanTitle(memory)}`}
      onPress={onOpen}
      style={({pressed}) => ({flex: 1, flexDirection: 'row', alignItems: 'center',
        gap: 12, minHeight: 64, opacity: pressed ? 0.75 : 1})}>
      <View importantForAccessibility="no-hide-descendants" style={{
        width: 64, height: 64, borderRadius: 12,
        backgroundColor: memory.kind === 'note' ? '#EFE9DA'
          : memory.kind === 'pdf' ? '#EEE1DC'
          : memory.kind === 'image' ? '#DBE7D7' : '#EEE7E5',
        alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{color: memory.kind === 'note' ? '#775D3F'
          : memory.kind === 'pdf' ? '#86594D'
          : memory.kind === 'image' ? '#42644E' : '#8C6976',
          fontSize: 23}}>{memory.kind === 'note' ? '≡' : memory.kind === 'pdf' ? '▤' : memory.kind === 'image' ? '▧' : '↗'}</Text>
      </View>
      <View style={{flex: 1, gap: 3}}>
        <Type variant="label" numberOfLines={2}>{humanTitle(memory)}</Type>
        <Type muted variant="caption" numberOfLines={1}>{meta}</Type>
        {!!detail && <Type muted variant="caption" numberOfLines={1}>{detail}</Type>}
      </View>
    </Pressable>
    <IconButton label={memory.starred ? 'Remove from Starred' : 'Add to Starred'}
      disabled={busy} onPress={onStar}>
      <Text style={{fontSize: 24, color: memory.starred ? '#B28A36' : p.muted,
        lineHeight: 28}}>{memory.starred ? '★' : '☆'}</Text>
    </IconButton>
  </View>;
}
