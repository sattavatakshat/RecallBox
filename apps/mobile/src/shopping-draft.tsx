import {useEffect, useRef, useState, type ComponentRef} from 'react';
import {AccessibilityInfo, Alert, findNodeHandle, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {usePreventRemove} from 'expo-router';
import * as Crypto from 'expo-crypto';
import {ApiError, ShoppingItem, ShoppingList, actionOptionsApi, shoppingApi} from './api';
import {useSession} from './session';
import {Button, Input, Notice, SheetSurface, TextAction, Type, tokens, usePalette} from './ui';

const sourceItems = (lines: string[]): ShoppingItem[] => lines.map(text => ({
  id: Crypto.randomUUID(), text, checked: false, origin: 'source', source_quote: text,
}));
/** Local-only RB-15 handoff. No record exists until Create list is confirmed. */
export function ShoppingDraftPreview({memoryId, sourceVersion, lines, onClose, onCreated}: {
  memoryId: string; sourceVersion: number; lines: string[]; onClose: () => void; onCreated: (list: ShoppingList) => void;
}) {
  const {authorized} = useSession();
  const auth = useRef(authorized); auth.current = authorized;
  const p = usePalette(), insets = useSafeAreaInsets();
  const [title, setTitle] = useState('Shopping list');
  const [items, setItems] = useState(() => sourceItems(lines));
  const [version, setVersion] = useState(sourceVersion);
  const [newItem, setNewItem] = useState('');
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [conflict, setConflict] = useState(false), [error, setError] = useState('');
  const lock = useRef(false), alive = useRef(true);
  const heading = useRef<ComponentRef<typeof View>>(null);
  useEffect(() => {alive.current = true; return () => {alive.current = false;};}, []);
  // The enclosing account/memory-keyed component scopes every draft to its source.
  const release = usePreventRemove(busy, () => {setError('Please wait for creation to finish.');});
  function close() {
    if (lock.current) return;
    if (uncertain) Alert.alert('Leave unconfirmed creation?', 'The list may already have been saved. Leaving discards this local draft; reopening checks for the saved list first.', [
      {text: 'Keep draft', style: 'cancel'}, {text: 'Leave draft', onPress: onClose},
    ]);
    else onClose();
  }
  function add() {
    if (!newItem.trim() || items.length >= 60 || lock.current || uncertain) return;
    setItems(old => [...old, {id: Crypto.randomUUID(), text: newItem.trim(), checked: false, origin: 'user', source_quote: null}]);
    setNewItem('');
  }
  async function reviewSource() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const latest = await auth.current(token => actionOptionsApi.forMemory(token, memoryId));
      if (!alive.current) return;
      const recipe = latest.items.find(option => option.kind === 'shopping');
      if (!recipe?.evidence_lines.length || !latest.source_version) {
        setError('The current source no longer has verified ingredients. Your draft is kept; you can cancel and review the memory.'); return;
      }
      const manual = items.filter(item => item.origin === 'user');
      if (manual.length + recipe.evidence_lines.length > 60) {
        setError('Remove some user-added ingredients before loading the updated source. A list supports 60 items.'); return;
      }
      Alert.alert('Use updated source ingredients?', 'This replaces source-derived ingredients and their edits with the current verified lines. Your list name and user-added items are kept.', [
        {text: 'Keep draft', style: 'cancel'},
        {text: 'Use updated ingredients', onPress: () => {
          setItems([...sourceItems(recipe.evidence_lines), ...manual]); setVersion(latest.source_version!); setConflict(false);
        }},
      ]);
    } catch {setError('Could not review the updated source. Your draft is kept. Retry when connected.');}
    finally {lock.current = false; setBusy(false);}
  }
  async function create() {
    if (lock.current || !title.trim() || !items.length || items.some(item => !item.text.trim()) || conflict) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const existing = await auth.current(token => shoppingApi.forSource(token, memoryId));
      if (!alive.current) return;
      if (existing.item) {release(); onCreated(existing.item); return;}
      setUncertain(false);
      try {
        const saved = await auth.current(token => shoppingApi.create(token, memoryId, {
          expected_source_version: version, title: title.trim(), items,
        }));
        if (!alive.current) return;
        release(); onCreated(saved);
      } catch (cause) {
        if (!alive.current) return;
        if (cause instanceof ApiError && cause.code === 'shopping_source_version_conflict') {
          setConflict(true); setError('The source changed after this draft opened. Your edits are kept. Review updated ingredients before creating.'); return;
        }
        if (cause instanceof ApiError && cause.status < 500) {
          setError(cause.code === 'insufficient_recipe_evidence' ? 'The source no longer has verified recipe ingredients. Your draft is kept.' :
            'The draft was rejected. Check the ingredients and source, then retry. Your edits are kept.'); return;
        }
        try {
          const checked = await auth.current(token => shoppingApi.forSource(token, memoryId));
          if (!alive.current) return;
          if (checked.item) {release(); onCreated(checked.item); return;}
          setError('Creation was not confirmed. Your draft is kept. Retry checks for a saved list before creating.');
        } catch {
          setUncertain(true); setError('Creation status is unknown. Your submitted draft is kept. Retry checks for an existing list before sending it again.');
        }
      }
    } catch {setError('Could not check for an existing list. Your draft is kept. Reconnect and retry.');}
    finally {lock.current = false; setBusy(false);}
  }
  const disabled = busy || uncertain;
  return <Modal visible transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={close}
    onShow={() => {const node = findNodeHandle(heading.current); if (node) AccessibilityInfo.setAccessibilityFocus(node);}}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex: 1, justifyContent: 'flex-end', backgroundColor: p.scrim, paddingTop: insets.top + tokens.space.small}}>
      <Pressable accessible={false} onPress={close} style={{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0}}/>
      <SheetSurface style={{maxHeight: '100%', flexShrink: 1}}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{padding: tokens.space.large, gap: tokens.space.medium}}>
          <View ref={heading} accessible accessibilityRole="header"><Type variant="sheetHeading">Review ingredients</Type></View>
          <Type muted>Review the saved source lines before creating your list. Changes remain local until you confirm.</Type>
          <Input label="List name" value={title} onChangeText={setTitle} maxLength={160} editable={!disabled}/>
          {items.map((item, index) => <View key={item.id} style={{gap: tokens.space.small, borderBottomWidth: tokens.geometry.divider, borderColor: p.line, paddingBottom: tokens.space.medium}}>
            <Input label={`Ingredient ${index + 1}`} value={item.text} maxLength={200} editable={!disabled}
              onChangeText={text => setItems(old => old.map(row => row.id === item.id ? {...row, text} : row))}/>
            <Type variant="caption" muted>{item.origin === 'user' ? 'Added by you' : item.text !== item.source_quote ? 'Edited by you · original source line below' : 'From saved source'}</Type>
            {item.source_quote && <Type selectable variant="caption" muted>{item.source_quote}</Type>}
            <TextAction label={`Remove ingredient ${index + 1}`} disabled={disabled} onPress={() => setItems(old => old.filter(row => row.id !== item.id))}/>
          </View>)}
          <Input label="Add your own ingredient" value={newItem} onChangeText={setNewItem} maxLength={200} editable={!disabled}/>
          <Button label="Add ingredient" variant="secondary" disabled={disabled || !newItem.trim() || items.length >= 60} onPress={add}/>
          <Type variant="caption" muted>{items.length} of 60 ingredients. Source quotations are kept separately from your edits.</Type>
          {!!error && <Notice kind="error">{error}</Notice>}
          {conflict && <Button label="Review updated source" variant="secondary" busy={busy} onPress={() => void reviewSource()}/>}
        </ScrollView>
        <View style={{padding: tokens.space.medium, paddingBottom: insets.bottom + tokens.space.medium, gap: tokens.space.small, borderTopWidth: tokens.geometry.divider, borderColor: p.line}}>
          <Button label={uncertain ? 'Check and retry creation' : 'Create list'} busy={busy}
            disabled={!title.trim() || !items.length || items.some(item => !item.text.trim()) || conflict || Boolean(newItem.trim())}
            onPress={() => void create()}/>
          {!!newItem.trim() && <Notice>Add or clear the pending ingredient before creating.</Notice>}
          <TextAction label="Cancel draft" disabled={busy} onPress={close}/>
        </View>
      </SheetSurface>
    </KeyboardAvoidingView>
  </Modal>;
}
