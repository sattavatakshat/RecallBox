import {tokens} from '../../src/theme';
import {useState} from 'react';
import {Alert, View} from 'react-native';
import {router} from 'expo-router';
import {useShareInbox} from '../../src/share-inbox';
import {useSession} from '../../src/session';
import {Button, Notice, Screen, TextAction, Type} from '../../src/ui';

/** Manual outbox recovery only. Instant confirmation belongs to native ShareActivity. */
export default function ShareInbox() {
  const {account,retry: restoreSession} = useSession();
  const inbox = useShareInbox(account?.id);
  const [renewing,setRenewing] = useState(false);
  async function retry() {
    setRenewing(true);
    try {await restoreSession();await inbox.retry();}
    finally {setRenewing(false);}
  }
  return <Screen compact>
    <TextAction label="Back to Library" onPress={() => router.dismissTo('/(account)')}/>
    <Type title>Shared on this device.</Type>
    <Type muted>Encrypted shares waiting for server confirmation. Items remain tied to the account that received them.</Type>
    {!!inbox.error && <Notice kind="error">{inbox.error}</Notice>}
    {!inbox.supported && <Notice>This installed build needs a native update to support the share inbox.</Notice>}
    {inbox.supported && !inbox.items.length && !inbox.error && <Type>No shares are waiting for this account.</Type>}
    {inbox.items.map(item => <View key={item.key} style={{gap: tokens.space.small,paddingVertical: tokens.space.compact}}>
      <Type variant="label">{item.title}</Type>
      <Type muted variant="caption">{item.kind} · Saved on this device · {item.blocked ? 'Needs attention' : 'Waiting to sync'}</Type>
      {!!item.error && <Notice>{item.error}</Notice>}
      <TextAction label="Remove local copy" onPress={() => Alert.alert('Remove this device copy?',
        'An earlier request may already have reached the server. Check Library before sharing again.',[
          {text:'Keep',style:'cancel'},
          {text:'Remove',style:'destructive',onPress:() => {void inbox.discard(item.key).catch(() => undefined);}},
        ])}/>
    </View>)}
    {inbox.items.length > 0 && <Button label="Retry syncing shares" busy={inbox.busy || renewing} onPress={() => void retry()}/>}
    <TextAction label="Refresh" onPress={() => void inbox.refresh()}/>
    <Type muted variant="caption">Expired sign-in requires reopening RecallBox and signing in. Android schedules network retries; force-stopping the app pauses its jobs until it is opened again.</Type>
  </Screen>;
}
