import React from 'react';
import {Pressable, Text, View} from 'react-native';
import type {MemorySummary} from './api';
import {Card, IconButton, Type, tokens, usePalette} from './ui';

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
  const label = kindLabel(memory);
  const preview = memory.kind === 'link' || memory.kind === 'url'
    ? (memory.extracted_text.trim() || memory.preview)
    : (memory.kind === 'note' ? memory.preview : memory.extracted_text.trim());
  const meta = [sourceName(memory), shortDate(memory.created_at)].filter(Boolean).join(' · ');
  return <Card style={{flexDirection: 'row', alignItems: 'center',
    padding: tokens.space.compact, gap: tokens.space.small}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${humanTitle(memory)}`}
      onPress={onOpen}
      style={({pressed}) => ({
        flex: 1, flexDirection: 'row', alignItems: 'center',
        gap: tokens.space.compact, minHeight: 70, opacity: pressed ? 0.75 : 1,
      })}>
      <View importantForAccessibility="no-hide-descendants" style={{
        width: 60, height: 64, borderRadius: tokens.radii.small,
        backgroundColor: p.surfaceMuted, alignItems: 'center', justifyContent: 'center',
      }}>
        <Text style={{color: p.accent, fontSize: 12, fontWeight: '700', letterSpacing: 0.7}}>
          {label}
        </Text>
      </View>
      <View style={{flex: 1, gap: 3}}>
        <Type variant="label" numberOfLines={2}>{humanTitle(memory)}</Type>
        {!!preview && <Type muted variant="caption" numberOfLines={2}>
          {preview.trim().slice(0, 125)}
        </Type>}
        <Type muted variant="caption" numberOfLines={1}>{meta}</Type>
        {!!memory.collection && <Type muted variant="caption" numberOfLines={1}>
          {memory.collection}
        </Type>}
      </View>
    </Pressable>
    <IconButton label={memory.starred ? 'Remove from Starred' : 'Add to Starred'}
      disabled={busy} onPress={onStar}>
      <Text style={{fontSize: 24, color: memory.starred ? '#B28A36' : p.muted,
        lineHeight: 28}}>{memory.starred ? '★' : '☆'}</Text>
    </IconButton>
  </Card>;
}
