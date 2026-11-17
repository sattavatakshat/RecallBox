import {memo} from 'react';
import {Pressable, View} from 'react-native';
import type {MemorySummary, SearchEvidence} from './api';
import {useBrandTheme} from './brand';
import {IconButton, SourcePlaceholder, Type, tokens} from './ui';

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

function Evidence({evidence, title = false}: {evidence: SearchEvidence; title?: boolean}) {
  const p = useBrandTheme();
  return <Type variant={title ? 'nativeHeading' : 'secondary'} numberOfLines={2}>
    {evidence.segments.map((part, index) => <Type key={index} variant={title ? 'nativeHeading' : 'secondary'}
      style={part.matched ? {backgroundColor: p.highlight, color: p.onHighlight} : undefined}>{part.text}</Type>)}
  </Type>;
}

/** No thumbnail API exists: show content icons instead of arbitrary images or full-size originals. */
export const MemoryCard = memo(function MemoryCard({memory, onOpen, onStar, busy = false, search = false}: {
  memory: MemorySummary; onOpen: () => void; onStar: () => void; busy?: boolean; search?: boolean;
}) {
  const p = useBrandTheme();
  const kind = memory.kind === 'url' ? 'link' : memory.kind;
  const evidence = search ? memory.match_evidence : null;
  return <View style={{flexDirection: 'row', alignItems: 'center', gap: tokens.space.tiny, paddingVertical: tokens.space.small, minHeight: 80}}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Open ${humanTitle(memory)}`}
      onPress={onOpen} style={({pressed}) => ({flex: 1, flexDirection: 'row', alignItems: 'center',
        gap: tokens.space.medium, minHeight: 60, opacity: pressed ? 0.7 : 1})}>
      <SourcePlaceholder kind={kind}/>
      <View style={{flex: 1, gap: tokens.space.tiny}}>
        {evidence?.field === 'title' ? <Evidence evidence={evidence} title/> :
          <Type variant={search ? 'nativeHeading' : 'cardTitle'} numberOfLines={2}>{humanTitle(memory)}</Type>}
        <Type variant="caption" muted numberOfLines={1}>
          {[sourceName(memory), shortDate(memory.created_at)].filter(Boolean).join(' · ')}
        </Type>
        {evidence && evidence.field !== 'title' && <View style={{gap: tokens.space.tiny}}>
          {!['user_note', 'extracted_text'].includes(evidence.field) &&
            <Type variant="caption" muted>{{source_url:'URL',collection:'Collection',labels:'Labels',topic_override:'Topic',tags_override:'Tags'}[evidence.field] ?? 'Saved metadata'}</Type>}
          <Evidence evidence={evidence}/>
        </View>}
      </View>
    </Pressable>
    <IconButton label={`${memory.starred ? 'Unstar' : 'Star'} ${humanTitle(memory)}`} icon="star"
      selected={memory.starred} disabled={busy} onPress={onStar} filled={memory.starred}
      color={memory.starred ? p.favorite : p.primaryText}/>

  </View>;
});
