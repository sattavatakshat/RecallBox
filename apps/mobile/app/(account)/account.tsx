import React, {useState} from 'react';
import {View} from 'react-native';
import {router} from 'expo-router';
import {useSession} from '../../src/session';
import {Button, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

export default function Account() {
  const {account, logout, message, retry}=useSession();
  const p=usePalette();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function leave() {
    setBusy(true);setError('');
    try {
      await logout();
    } catch {
      setError('Could not confirm sign-out. Reconnect and try again.');
    } finally {setBusy(false);}
  }

  return <Screen compact>
    <TextAction label="Back to Library" onPress={()=>router.replace('/(account)')}/>
    <Type variant="eyebrow" muted>YOUR PRIVATE SPACE</Type>
    <Type title>Your RecallBox.</Type>
    <Type muted>Account, privacy and the things that belong to you.</Type>
    <View style={{backgroundColor:p.surface,borderRadius:16,padding:18,gap:7,
      borderColor:p.line,borderWidth:1}}>
      <Type variant="section">{account?.display_name || 'Your account'}</Type>
      <Type muted variant="caption">{account
        ? `Account created ${new Date(account.created_at).toLocaleDateString(undefined,
          {day:'numeric',month:'long',year:'numeric'})}` : 'Restoring account…'}</Type>
      {!!message && <Notice>{message}</Notice>}
      {!!error && <Notice kind="error">{error}</Notice>}
      {!!message && <Button label="Reconnect account" onPress={()=>void retry()}/>}
    </View>
    <View style={{gap:12}}>
      <Type variant="section">Privacy & your data</Type>
      <Type muted>Your saved content belongs to your signed-in account. Supported public sources
        may be processed so their text is searchable. RecallBox does not provide
        end-to-end encryption.</Type>
      <Type muted variant="caption">Exports and account deletion are not yet available inside
        this prototype. We won't show buttons that pretend those operations exist.</Type>
    </View>
    <View style={{gap:10}}>
      <Type variant="section">Appearance</Type>
      <Type muted>The app follows your device's light or dark appearance.</Type>
    </View>
    <Button label="Sign out of this device" variant="secondary" busy={busy}
      onPress={()=>void leave()}/>
  </Screen>;
}
