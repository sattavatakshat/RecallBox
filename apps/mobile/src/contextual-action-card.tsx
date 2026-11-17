import {useCallback, useEffect, useRef, useState, type ComponentRef} from 'react';
import {AccessibilityInfo, findNodeHandle, Pressable, View} from 'react-native';
import {router, useFocusEffect} from 'expo-router';
import {ActionOption, ApiError, Memory, ShoppingList, actionOptionsApi, learningApi, shoppingApi, tripApi} from './api';
import {useSession} from './session';
import {ShoppingDraftPreview} from './shopping-draft';
import {Button, Card, Icon, Notice, TextAction, Type, tokens, usePalette} from './ui';

// Stable priority for a future response with multiple eligible actions.
const priority: ActionOption['kind'][] = ['shopping', 'trip', 'learning'];
const copy = {
  shopping: {section: 'Useful for this recipe', title: 'Ingredients ready to collect', description: 'Ingredients found in your saved recipe.', action: 'Make shopping list', icon: 'shopping'},
  trip: {section: 'Useful for this trip idea', title: 'Save places for a trip', description: 'Keep this saved travel source as inspiration for a shortlist.', action: 'Start trip shortlist', icon: 'travel'},
  learning: {section: 'Useful for learning', title: 'Keep this in your learning queue', description: 'Return to this saved learning source when you are ready.', action: 'Add to learning queue', icon: 'learning'},
} as const;
type Eligibility = {context: string; option: ActionOption | null; version?: number};
export function ContextualActionCard(props: {memory: Memory; disabled: boolean; onBusyChange: (value: boolean) => void; onRefreshMemory: () => void}) {
  const {account} = useSession();
  return <SourceAction key={`${account?.id}:${props.memory.id}`} {...props}/>;
}
function SourceAction({memory, disabled, onBusyChange, onRefreshMemory}: {memory: Memory; disabled: boolean; onBusyChange: (value: boolean) => void; onRefreshMemory: () => void}) {
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const p = usePalette();
  const context = `${memory.id}:${memory.version}:${memory.processing_state}:${memory.updated_at}`;
  const [eligibility, setEligibility] = useState<Eligibility | null>(null);
  const [error, setError] = useState(''), [lookupError, setLookupError] = useState('');
  const [actionError, setActionError] = useState('');
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false);
  const [existing, setExisting] = useState<ShoppingList | null>(null), [checkedList, setCheckedList] = useState(false);
  const [draft, setDraft] = useState<{lines: string[]; version: number} | null>(null);
  const generation = useRef(0), inFlight = useRef<string | null>(null), lock = useRef(false), alive = useRef(true);
  const navigated = useRef(false);
  const state = useRef(eligibility); state.current = eligibility;
  const trigger = useRef<ComponentRef<typeof Pressable>>(null);
  useEffect(() => {alive.current = true; return () => {alive.current = false; generation.current += 1;};}, []);
  const lookup = useCallback(async () => {
    setLookupError(''); setCheckedList(false);
    try {
      const result = await auth.current(token => shoppingApi.forSource(token, memory.id));
      if (alive.current) {setExisting(result.item); setCheckedList(true);}
    } catch {if (alive.current) setLookupError('Could not check for a saved shopping list. Retry before continuing.');}
  }, [memory.id]);
  const load = useCallback(async () => {
    if (inFlight.current === context) return;
    inFlight.current = context;
    const epoch = ++generation.current;
    setError(''); setExpanded(false); setCheckedList(false); setLookupError('');
    try {
      const result = await auth.current(token => actionOptionsApi.forMemory(token, memory.id));
      if (!alive.current || generation.current !== epoch) return;
      const option = priority.map(kind => result.items.find(item => item.kind === kind)).find(Boolean) ?? null;
      setEligibility({context, option, version: result.source_version});
      if (option?.kind === 'shopping') await lookup();
    } catch {if (alive.current && generation.current === epoch) setError('Could not check useful actions for this save.');}
    finally {if (inFlight.current === context) inFlight.current = null;}
  }, [context, memory.id, lookup]);
  useEffect(() => {void load(); return () => {generation.current += 1; inFlight.current = null;};}, [load]);
  // Refresh only the nonmutating existing-list lookup on return. Eligibility is
  // fetched again when the source context changes, not on every focus/render.
  useFocusEffect(useCallback(() => {
    navigated.current = false;
    if (state.current?.option?.kind === 'shopping') void lookup();
  }, [lookup]));
  function closeDraft() {
    setDraft(null);
    requestAnimationFrame(() => {const node = findNodeHandle(trigger.current); if (node) AccessibilityInfo.setAccessibilityFocus(node);});
  }
  function openList(list: ShoppingList) {
    if (!alive.current || navigated.current) return;
    navigated.current = true;
    setExisting(list); setDraft(null); router.push({pathname: '/(account)/shopping/[id]', params: {id: list.id}});
  }
  async function act() {
    const option = eligibility?.context === context ? eligibility.option : null;
    if (!option || disabled || lock.current || navigated.current) return;
    lock.current = true; setBusy(true); setActionError(''); onBusyChange(true);
    try {
      if (option.kind === 'shopping') {
        // Opening a preview never calls POST, including when a prior attempt is uncertain.
        const found = await auth.current(token => shoppingApi.forSource(token, memory.id));
        if (!alive.current) return;
        setExisting(found.item); setCheckedList(true);
        if (found.item) openList(found.item);
        else if (!eligibility?.version || !option.evidence_lines.length) setActionError('A verified ingredient draft is unavailable. Refresh the source and retry.');
        else setDraft({lines: option.evidence_lines, version: eligibility.version});
      } else if (option.kind === 'trip') {
        // Existing server serialization and one-active-source constraint make retries safe.
        const trip = await auth.current(token => tripApi.create(token, memory.id));
        if (alive.current && !navigated.current) {navigated.current = true; router.push({pathname: '/(account)/trip/[id]', params: {id: trip.id}});}
      } else {
        await auth.current(token => learningApi.create(token, memory.id));
        if (alive.current && !navigated.current) {navigated.current = true; router.push('/(account)/learning');}
      }
    } catch (cause) {
      if (alive.current) setActionError(cause instanceof ApiError && cause.status === 404
        ? 'This memory is no longer available. Refresh the memory to check its current state.'
        : cause instanceof ApiError && cause.status === 422
        ? 'The current source no longer supports this action. Refresh the memory before trying again.'
        : 'The action could not be confirmed. Retry safely reuses any existing saved result. Your source is unchanged.');
    } finally {lock.current = false; if (alive.current) {setBusy(false); onBusyChange(false);}}
  }
  // Keep the local draft mounted even if eligibility changes while it is open.
  const preview = draft ? <ShoppingDraftPreview memoryId={memory.id} sourceVersion={draft.version} lines={draft.lines} onClose={closeDraft} onCreated={openList}/> : null;
  if (error) return <><View style={{gap: tokens.space.small}}><Notice>{error}</Notice><TextAction label="Retry checking actions" disabled={disabled} onPress={() => void load()}/></View>{preview}</>;
  const option = eligibility?.context === context ? eligibility.option : null;
  if (!option) return <>{null}{preview}</>;
  const text = copy[option.kind];
  const stale = typeof eligibility?.version === 'number' && eligibility.version !== memory.version;
  const lines = option.evidence_lines.slice(0, 24);
  return <><View style={{gap: tokens.space.compact}}>
    <Type variant="section">{text.section}</Type>
    <Card style={{gap: tokens.space.medium, backgroundColor: p.surface, borderColor: p.line, padding: tokens.space.medium}}>
      <View style={{flexDirection: 'row', alignItems: 'flex-start', gap: tokens.space.medium}}>
        <View style={{width: tokens.touch, height: tokens.touch, backgroundColor: p.iconSurface, borderRadius: tokens.radii.tile, alignItems: 'center', justifyContent: 'center'}}>
          <Icon name={text.icon} color={p.brand}/>
        </View>
        <View style={{flex: 1, gap: tokens.space.tiny}}><Type variant="cardTitle">{text.title}</Type><Type muted variant="secondary">{text.description}</Type></View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Why this action?" accessibilityState={{expanded}}
        onPress={() => setExpanded(value => !value)} style={{minHeight: tokens.touch, flexDirection: 'row', alignItems: 'center', gap: tokens.space.small}}>
        <Type variant="label" style={{color: p.accent, textDecorationLine: 'underline'}}>Why this action?</Type><Icon name={expanded ? 'chevron' : 'down'} color={p.accent}/>
      </Pressable>
      {expanded && <View style={{gap: tokens.space.small}}>
        <Type variant="label">Eligibility explanation</Type><Type selectable muted variant="secondary">{option.reason}</Type>
        {!!lines.length && <><Type variant="label">Saved source lines</Type>{lines.map((line, index) => <Type key={index} selectable muted variant="secondary">{line}</Type>)}</>}
        {option.kind === 'trip' && <Notice>This source is travel inspiration. Addresses, opening hours and travel times are not verified.</Notice>}
      </View>}
      {stale && <><Notice>The source changed. Refresh the memory before using this action.</Notice><TextAction label="Refresh memory" onPress={onRefreshMemory}/></>}
      {option.kind === 'shopping' && !checkedList && !lookupError && <Notice>Checking for a saved shopping list…</Notice>}
      {!!lookupError && <><Notice>{lookupError}</Notice><TextAction label="Retry list lookup" disabled={busy || disabled} onPress={() => void lookup()}/></>}
      {!!actionError && <><Notice kind="error">{actionError}</Notice><TextAction label="Refresh memory" disabled={busy || disabled} onPress={onRefreshMemory}/></>}
      <Button buttonRef={trigger} label={option.kind === 'shopping' && existing ? 'Open shopping list' : text.action}
        style={{borderRadius: tokens.radii.full}} busy={busy} disabled={disabled || stale || (option.kind === 'shopping' && !checkedList)} onPress={() => void act()}/>
    </Card>
  </View>{preview}</>;
}
