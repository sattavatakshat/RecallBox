import {useRef, useState, type RefObject} from 'react';
import {View} from 'react-native';
import {ApiError, Collection, collectionsApi} from './api';
import {useSession} from './session';
import {Button, Input, Notice, TextAction, Type, tokens} from './ui';

/** Shared name entry and confirmed creation for Organize and the Collections hub. */
export function CollectionCreationForm({name, onChangeName, onCreated, onCancel, onBusyChange, pendingName, disabled = false, active = true}: {
  pendingName: RefObject<string | null>; active?: boolean; name: string; onChangeName: (value: string) => void; onCreated: (collection: Collection) => void;
  onCancel: () => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean;
}) {
  const {authorized} = useSession();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Keep the exact attempted name until a successful reconciliation, even if edited.
  const uncertain = pendingName.current;
  function setUncertain(value: string | null) {pendingName.current = value;}
  const value = name.trim();
  const invalid = Array.from(value).length > 80;
  async function submit() {
    if (lock.current || disabled || (uncertain === null && (!value || invalid))) return;
    lock.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      if (uncertain !== null) {
        const page = await authorized(token => collectionsApi.list(token));
        const found = page.items.find(item => item.name.toLowerCase() === uncertain.toLowerCase());
        if (found) {setUncertain(null); onCreated(found); return;}
        if (page.has_more) {
          setError('The collection list is incomplete. Check your collections before trying again.'); return;
        }
        setUncertain(null);
        setError('No matching collection was found. You can retry Create.');
        return;
      }
      const created = await authorized(token => collectionsApi.create(token, value));
      onCreated(created);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status < 500) {
        setError(cause.code === 'collection_name_exists'
          ? 'A collection with that name already exists. Choose another name.'
          : cause.code === 'collection_limit_reached'
            ? 'You have reached the limit of 100 collections. Remove one before creating another.'
            : cause.status === 422 ? 'Use a collection name of 1–80 characters.'
              : 'Collection creation was not confirmed. Please try again.');
      } else {
        setUncertain(uncertain ?? value);
        setError('Creation was not confirmed. Your name is preserved. Check collections before retrying.');
      }
    } finally {lock.current = false; setBusy(false); onBusyChange?.(false);}
  }
  if (!active) return null;
  return <View style={{gap: tokens.space.medium}}>
    <Input label="Collection name" value={name} onChangeText={onChangeName} autoFocus
      editable={!busy && !disabled && uncertain === null} maxLength={160} returnKeyType="done" onSubmitEditing={() => void submit()}/>
    <Type variant="caption" muted>Up to 80 characters. Creates an empty collection.</Type>
    {invalid && <Notice kind="error">Use no more than 80 characters.</Notice>}
    {!!error && <Notice kind="error">{error}</Notice>}
    <Button label={uncertain !== null ? 'Check collections' : 'Create'} busy={busy}
      disabled={disabled || (uncertain === null && (!value || invalid))} onPress={() => void submit()}/>
    <TextAction label="Cancel" disabled={busy || disabled} onPress={onCancel}/>
  </View>;
}
