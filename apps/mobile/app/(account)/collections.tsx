import {useCallback, useRef, useState, type ComponentRef} from 'react';
import {AccessibilityInfo, findNodeHandle, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View} from 'react-native';
import {SafeAreaView, useSafeAreaInsets} from 'react-native-safe-area-context';
import {router, useFocusEffect} from 'expo-router';
import {Collection, collectionsApi} from '../../src/api';
import {useSession} from '../../src/session';
import {AppHeader} from '../../src/navigation-ui';
import {CollectionCreationForm} from '../../src/collection-creation';
import {Button, Divider, Icon, LoadingIndicator, Notice, SheetSurface, Type, tokens, usePalette} from '../../src/ui';

export default function Collections() {
  const {account} = useSession();
  // Account-keyed state also protects against a direct switch between signed-in users.
  return <CollectionsHub key={account?.id}/>;
}
function CollectionsHub() {
  const {account, authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const p = usePalette();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Collection[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const pendingCollectionName = useRef<string | null>(null);
  const [creationBusy, setCreationBusy] = useState(false);
  const creationLock = useRef(false);
  const restoreFocus = useRef(false);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const fetching = useRef(false);
  const refreshedAt = useRef(0);
  const changed = useRef(false);
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  const refresh = useCallback(async () => {
    if (fetching.current) return;
    fetching.current = true; setLoading(true); setError('');
    try {
      const page = await auth.current(access => collectionsApi.list(access));
      setItems(page.items); setHasMore(page.has_more); setLoaded(true);
      refreshedAt.current = Date.now(); changed.current = false;
    } catch {setError('Could not load your collections. Check your connection and try again.');}
    finally {fetching.current = false; setLoading(false);}
  }, []);
  useFocusEffect(useCallback(() => {
    if (changed.current || Date.now() - refreshedAt.current > 30_000) void refresh();
  }, [refresh]));
  function open(item: Collection) {
    restoreFocus.current = false;
    changed.current = true;
    router.navigate({pathname: '/(account)/collection/[id]', params: {id: item.id}});
  }
  function close() {
    if (creationLock.current) return;
    restoreFocus.current = true;
    setCreating(false); // Preserve the draft on cancellation, including uncertain outcomes.
    requestAnimationFrame(() => {
      const target = findNodeHandle(trigger.current);
      if (target) AccessibilityInfo.setAccessibilityFocus(target);
    });
  }
  const empty = loaded && !loading && !error && items.length === 0;
  const newCollection = <Button buttonRef={trigger} label="New collection" variant="secondary" size="compact" onPress={() => setCreating(true)}
      leading={<Icon name="save" color={p.accent}/>}
      labelStyle={{color: p.accent}} style={{backgroundColor: 'transparent', borderColor: p.lineFocused,
        borderRadius: tokens.radii.full, paddingHorizontal: tokens.space.compact, paddingVertical: tokens.space.small}}/>;
  return <SafeAreaView edges={['top', 'left', 'right']} style={{flex: 1, backgroundColor: p.background}}>
    <FlatList data={items} keyExtractor={item => item.id} initialNumToRender={12}
      contentContainerStyle={{paddingHorizontal: tokens.geometry.screenPadding, paddingTop: tokens.space.regular,
        paddingBottom: tokens.geometry.listBottomClearance, maxWidth: tokens.width, width: '100%', alignSelf: 'center', flexGrow: 1}}
      refreshing={loading && loaded} onRefresh={() => void refresh()}
      ItemSeparatorComponent={() => <Divider inset={tokens.geometry.thumbnail + tokens.space.regular}/>}
      ListHeaderComponent={<View>
        <AppHeader name={account?.display_name} onAccount={() => router.navigate('/(account)/account')}/>
        <Type variant="display" style={{marginTop: tokens.space.large}}>Collections.</Type>
        <Type variant="intro" style={{color: p.mutedText, marginTop: tokens.space.small}}>The things you keep together.</Type>
        {!empty && <View style={{flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
          gap: tokens.space.small, marginTop: tokens.space.sectionSmall, marginBottom: tokens.space.small}}>
          <Type variant="section">Your collections</Type>{newCollection}
        </View>}
        {!loaded && loading && <View style={{padding: tokens.space.large}}><LoadingIndicator label="Loading collections"/></View>}
        {!!error && <View style={{gap: tokens.space.small, paddingVertical: tokens.space.medium}}>
          <Notice kind="error">{error}</Notice>
          {items.length > 0 && <Notice>Showing previously confirmed collections. The list may be outdated.</Notice>}
          <Button label="Try again" variant="secondary" disabled={loading} onPress={() => void refresh()}/>
        </View>}
      </View>}
      ListEmptyComponent={empty ? <View style={{paddingVertical: tokens.space.section, gap: tokens.space.medium}}>
        <Type variant="section">Keep related things together.</Type>
        <Type muted>Create a collection for the things you're planning, learning, or want to revisit.</Type>
        <Button buttonRef={trigger} label="Create your first collection" onPress={() => setCreating(true)}/>
      </View> : undefined}
      renderItem={({item}) => {
        const count = typeof item.item_count === 'number' ? `${item.item_count} saved ${item.item_count === 1 ? 'item' : 'items'}` : '';
        return <Pressable accessibilityRole="button" accessibilityLabel={`${item.name}${count ? `, ${count}` : ''}. Open collection.`}
          onPress={() => open(item)} style={({pressed}) => ({minHeight: tokens.geometry.sheetActionHeight,
            flexDirection: 'row', alignItems: 'center', gap: tokens.space.regular, paddingVertical: tokens.space.compact, opacity: pressed ? 0.7 : 1})}>
          <View style={{width: tokens.geometry.thumbnail, height: tokens.geometry.thumbnail, borderRadius: tokens.radii.tile,
            backgroundColor: p.iconSurface, alignItems: 'center', justifyContent: 'center'}}>
            <Icon name="collections" color={p.brand} size={tokens.geometry.iconLarge}/>
          </View>
          <View style={{flex: 1, gap: tokens.space.tiny}}><Type variant="actionTitle">{item.name}</Type>
            {!!count && <Type variant="secondary" style={{color: p.mutedText}}>{count}</Type>}</View>
          <Icon name="chevron"/>
        </Pressable>;
      }}
      ListFooterComponent={hasMore ? <Notice>Showing the newest 100 collections. Older collections remain saved; this list is incomplete.</Notice> : undefined}/>
    <Modal transparent visible={creating} animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}
      onDismiss={() => {if (!restoreFocus.current) return; const target = findNodeHandle(trigger.current); if (target) AccessibilityInfo.setAccessibilityFocus(target);}}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{flex: 1, justifyContent: 'flex-end', backgroundColor: p.scrim, paddingTop: insets.top + tokens.space.small}}>
        <Pressable accessible={false} style={{position: 'absolute', top: 0, bottom: 0, left: 0, right: 0}} onPress={close}/>
        <SheetSurface style={{flexShrink: 1}}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: tokens.geometry.screenPadding,
            paddingBottom: insets.bottom + tokens.space.large, gap: tokens.space.medium}}>
            <Type variant="sheetHeading">New collection</Type>
            <CollectionCreationForm pendingName={pendingCollectionName} active={creating} name={name} onChangeName={setName} disabled={creationBusy}
              onBusyChange={value => {creationLock.current = value; setCreationBusy(value);}}
              onCancel={close} onCreated={item => {setName(''); setCreating(false); open(item);}}/>
          </ScrollView>
        </SheetSurface>
      </KeyboardAvoidingView>
    </Modal>
  </SafeAreaView>;
}
