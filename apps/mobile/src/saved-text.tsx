import {memo, useMemo, useState} from 'react';
import {View} from 'react-native';
import {Icon, Notice, TextAction, Type, tokens, usePalette} from './ui';

/** Bound each native text view; slices retain the exact saved string and paragraph breaks. */
export const SavedText = memo(function SavedText({text, note = false}: {text: string; note?: boolean}) {
  const p = usePalette();
  const [visible, setVisible] = useState(1);
  const sections = useMemo(() => {
    const result: string[] = [];
    let start = 0;
    while (start < text.length) {
      const limit = Math.min(start + (start === 0 ? 1200 : 3000), text.length);
      const paragraph = text.lastIndexOf('\n\n', limit);
      const word = text.lastIndexOf(' ', limit);
      let end = limit === text.length ? limit : paragraph > start ? paragraph + 2 : word > start ? word + 1 : limit;
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1] ?? '')) end -= 1;
      result.push(text.slice(start, end));
      start = end;
    }
    return result;
  }, [text]);
  const count = note ? sections.length : visible;
  return <View style={{gap: tokens.space.medium}}>
    <View style={{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',gap:tokens.space.small}}>
      <Type variant="section">{note ? 'Your note' : 'From the source'}</Type>
      {!note && <View style={{flexDirection:'row',alignItems:'center',gap:tokens.space.small}}>
        <Icon name="pdf" color={p.mutedText}/><Type variant="caption" muted>Extracted text</Type>
      </View>}
    </View>
    {!note && visible > 1 && <TextAction label="Show less source text" onPress={() => setVisible(1)}/>}
    <View>
      {sections.slice(0, count).map((section, index) => <Type key={index} selectable variant="intro">{section}</Type>)}
    </View>
    {!note && count < sections.length && <TextAction icon="down"
      label={visible === 1 ? 'Read available source text' : 'Read more source text'}
      onPress={() => setVisible(value => value + 4)}/>}
    {!note && text.length >= 100000 && <Notice>Extraction is limited to 100,000 characters. Open the original for any remaining content.</Notice>}
    {!note && <Notice>This is the available saved text and may cover only part of the original.</Notice>}
  </View>;
});
