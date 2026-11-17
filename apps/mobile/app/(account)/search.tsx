import {useCallback, useEffect, useRef, useState} from 'react';
import {Keyboard, Pressable, View, useColorScheme} from 'react-native';
import {router, useFocusEffect, useLocalSearchParams} from 'expo-router';
import {AppHeader} from '../../src/navigation-ui';
import {useSession} from '../../src/session';
import {searchHistory, SEARCH_QUERY_LIMIT} from '../../src/search-history';
import {Divider, Icon, IconButton, Input, type InputHandle, LoadingIndicator, Notice, Screen, SectionHeader, Type, tokens, usePalette} from '../../src/ui';

/** RB-07 owns query entry and real submitted history; RB-08 owns retrieval. */
export default function Search() {
  const params = useLocalSearchParams<{q?: string}>();
  const {account} = useSession();
  const p = usePalette();
  const scheme = useColorScheme();
  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q.slice(0, SEARCH_QUERY_LIMIT) : '');
  const [history, setHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<InputHandle>(null);
  const focused = useRef(false);
  const submitting = useRef(false);
  const alive = useRef(false);
  const attempt = useRef(0);

  useEffect(() => {
    if (typeof params.q === 'string') setQuery(params.q.slice(0, SEARCH_QUERY_LIMIT));
  }, [params.q]);

  useEffect(() => {
    alive.current = true;
    return () => {alive.current = false;};
  }, [account?.id]);

  useFocusEffect(useCallback(() => {
    focused.current = true;
    let current = true;
    setHistory([]);setLoading(true);setLoadError(false);
    if (account) void searchHistory.load(account.id).then(items => {
      if (current) setHistory(items);
    }).catch(() => {if (current) setLoadError(true);})
      .finally(() => {if (current) setLoading(false);});
    attempt.current += 1;
    submitting.current = false;
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => {current = false;focused.current = false;attempt.current += 1;cancelAnimationFrame(frame);input.current?.blur();};
  }, [account?.id]));

  async function submit(value = query) {
    const q = value.trim().slice(0, SEARCH_QUERY_LIMIT);
    if (!q || !account || submitting.current || clearing) return;
    submitting.current = true;
    const current = ++attempt.current;
    setQuery(q);setError('');
    try {
      const items = await searchHistory.remember(account.id, q);
      if (alive.current) {setHistory(items);setLoadError(false);}
    } catch {
      if (alive.current) setError('Search history could not be saved on this device. Your search can still run.');
    }
    if (!alive.current || !focused.current || current !== attempt.current) return;
    Keyboard.dismiss();
    router.push({pathname: '/(account)/results', params: {q}});
  }

  async function clearHistory() {
    if (!account || clearing || submitting.current) return;
    setClearing(true);setError('');
    try {
      await searchHistory.clear(account.id);
      if (alive.current) {setHistory([]);setLoadError(false);}
    } catch {
      if (alive.current) setError('Search history could not be cleared. Please try again.');
    } finally {if (alive.current) setClearing(false);}
  }

  return <Screen>
    <AppHeader name={account?.display_name} onAccount={() => router.push('/(account)/account')}/>
    <Type variant="display">Find it again.</Type>
    <Input label="Search" hideLabel rounded inputRef={input} value={query} onChangeText={setQuery}
      leading={<Icon name="search"/>}
      trailing={query.length > 0 ? <IconButton icon="close" label="Clear query" onPress={() => {
        setQuery('');input.current?.focus();
      }}/> : undefined}
      autoFocus autoCapitalize="none" autoCorrect={false} maxLength={SEARCH_QUERY_LIMIT}
      keyboardAppearance={scheme === 'dark' ? 'dark' : 'light'}
      returnKeyType="search" submitBehavior="submit" onSubmitEditing={() => void submit()}
      placeholder="Search anything you've saved…"/>
    <View style={{gap: tokens.space.small}}>
      <SectionHeader title="Recent searches" action={<Pressable accessibilityRole="button"
        accessibilityLabel="Clear search history" accessibilityState={{disabled: clearing || loading, busy: clearing}}
        disabled={clearing || loading} onPress={() => void clearHistory()}
        style={({pressed}) => ({minHeight: tokens.touch, minWidth: tokens.touch, alignItems: 'flex-end',
          justifyContent: 'center', opacity: clearing || loading ? 0.5 : pressed ? 0.7 : 1})}>
        <Type variant="secondary" style={{color: p.brand}}>{clearing ? 'Clearing…' : 'Clear'}</Type>
      </Pressable>}/>
      {loading ? <LoadingIndicator label="Loading recent searches"/> : loadError ?
        <Notice kind="error">Recent searches could not be loaded from this device. You can still search, or clear local history to reset it.</Notice> :
        history.length === 0 ? <Type muted variant="secondary">Search by a title, topic, or something you remember.</Type> :
        history.map((item, index) => <View key={item}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Search again for ${item}`}
            onPress={() => void submit(item)} style={({pressed}) => ({minHeight: tokens.touch,
              paddingVertical: tokens.space.compact, flexDirection: 'row', alignItems: 'center',
              gap: tokens.space.medium, opacity: pressed ? 0.7 : 1})}>
            <Icon name="clock" color={p.brand}/>
            <Type numberOfLines={1} style={{flex: 1}}>{item}</Type>
            <Icon name="chevron" color={p.mutedText}/>
          </Pressable>
          {index < history.length - 1 && <Divider inset={tokens.geometry.icon + tokens.space.medium}/>}
        </View>)}
      {!!error && <Notice kind="error">{error}</Notice>}
    </View>
  </Screen>;
}
