import React, {useState} from 'react';
import {Linking, Pressable, View} from 'react-native';
import {router} from 'expo-router';
import {useMemories} from '../../src/memories';
import {useSession} from '../../src/session';
import {Button, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

type Section='account'|'notifications'|'appearance'|'privacy';
const sections:Array<{key:Section|'sync'|'help';title:string;description:string;glyph:string}>=[
  {key:'account',title:'Account & sign-in',description:'Your secure signed-in profile',glyph:'◉'},
  {key:'notifications',title:'Notifications',description:'Reminders and quiet hours',glyph:'◷'},
  {key:'appearance',title:'Appearance',description:'Light and dark mode',glyph:'☼'},
  {key:'privacy',title:'Privacy & your data',description:'Your saved sources and access',glyph:'◇'},
  {key:'sync',title:'Sync & offline',description:'Captured items and recovery',glyph:'↻'},
  {key:'help',title:'Help & feedback',description:'Report a problem or share ideas',glyph:'?'},
];

/** RB-19 settings: six real controls, no fake export/delete promises. */
export default function Account(){
  const {account,logout,message,retry}=useSession();
  const memories=useMemories();
  const p=usePalette();
  const [active,setActive]=useState<Section|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');

  async function leave(){
    setBusy(true);setError('');
    try{await logout();}
    catch{setError('Could not confirm sign-out. Reconnect and try again.');}
    finally{setBusy(false);}
  }

  async function select(key:Section|'sync'|'help'){
    setError('');
    if(key==='sync'){router.push('/(account)/recovery');return;}
    if(key==='help'){
      try{await Linking.openURL('https://github.com/sattavatakshat/RecallBox/issues/new');}
      catch{setError('Could not open the feedback page on this device.');}
      return;
    }
    setActive(current=>current===key?null:key);
  }

  return <Screen compact>
    <TextAction label="← Library" onPress={()=>router.dismissTo('/(account)')}/>
    <Type title>Your RecallBox.</Type>
    <Type muted>Account and personal choices.</Type>
    {!!error&&<Notice kind="error">{error}</Notice>}
    {!!message&&<Notice>{message}</Notice>}
    <View style={{gap:10}}>
      {sections.map(item=><View key={item.key} style={{gap:6}}>
        <Pressable accessibilityRole="button" accessibilityLabel={item.title}
          accessibilityState={{expanded:active===item.key}}
          onPress={()=>void select(item.key)}
          style={({pressed})=>({
            backgroundColor:pressed?p.surfaceMuted:p.surface,
            minHeight:76,padding:14,borderRadius:15,
            borderWidth:1,borderColor:p.line,
            flexDirection:'row',alignItems:'center',gap:13,
          })}>
          <View importantForAccessibility="no-hide-descendants"
            style={{height:43,width:43,borderRadius:12,backgroundColor:p.surfaceMuted,
              justifyContent:'center',alignItems:'center'}}>
            <Type style={{fontSize:22,color:p.accent}}>{item.glyph}</Type>
          </View>
          <View style={{flex:1,gap:3}}>
            <Type variant="label">{item.title}</Type>
            <Type muted variant="caption">{item.description}</Type>
          </View>
          <Type muted>{active===item.key?'⌄':'›'}</Type>
        </Pressable>
        {active===item.key&&<View style={{backgroundColor:p.surfaceMuted,
          borderRadius:14,padding:16,gap:10}}>
          {active==='account'&&<>
            <Type variant="section">{account?.display_name||'Your account'}</Type>
            <Type muted>{account
              ? 'Account created '+new Date(account.created_at).toLocaleDateString(
                undefined,{day:'numeric',month:'long',year:'numeric'})
              : 'Restoring account details…'}</Type>
            {!!message&&<Button variant="secondary" label="Reconnect account"
              onPress={()=>void retry()}/>}
          </>}
          {active==='notifications'&&<>
            <Type variant="label">In-app reminders</Type>
            <Type muted>Choose a future time to revisit your saved content.
              Android notification alerts are not enabled in this beta.</Type>
            <Button label="View reminders" variant="secondary"
              onPress={()=>router.push('/(account)/reminders')}/>
          </>}
          {active==='appearance'&&<>
            <Type variant="label">Follow device appearance</Type>
            <Type muted>RecallBox currently follows your Android light/dark mode.
              An in-app override has not been implemented.</Type>
          </>}
          {active==='privacy'&&<>
            <Type variant="label">Private to your signed-in account</Type>
            <Type muted>Your saved links, documents and notes are processed by RecallBox's
              server to support extraction and search. This is not end-to-end encryption.</Type>
            <Type muted>Account export and deletion are not available in this beta.
              No export or delete button is shown until those processes are implemented.</Type>
          </>}
        </View>}
      </View>)}
    </View>
    <Button label="View archived memories" variant="secondary" onPress={() => {
      void memories.refresh(true, false, null).catch(() => undefined);
      router.dismissTo('/(account)');
    }}/>
    <Button label="Review device shares" variant="secondary"
      onPress={() => router.push('/(account)/incoming-share')}/>
    <Button label="Sign out" variant="secondary" busy={busy} onPress={()=>void leave()}/>
  </Screen>;
}
