import {tokens} from '../../src/theme';
import {Icon, type IconName} from '../../src/icons';
import {useState} from 'react';
import {Linking, Pressable, View} from 'react-native';
import {router} from 'expo-router';
import {useMemories} from '../../src/memories';
import {useSession} from '../../src/session';
import {Button, Notice, Screen, TextAction, Type, usePalette} from '../../src/ui';

type Section='account'|'notifications'|'appearance'|'privacy';
const sections:Array<{key:Section|'sync'|'help';title:string;description:string;icon:IconName}>=[
  {key:'account',title:'Account & sign-in',description:'Your secure signed-in profile',icon:'account'},
  {key:'notifications',title:'Notifications',description:'Reminders and quiet hours',icon:'notifications'},
  {key:'appearance',title:'Appearance',description:'Light and dark mode',icon:'appearance'},
  {key:'privacy',title:'Privacy & your data',description:'Your saved sources and access',icon:'privacy'},
  {key:'sync',title:'Sync & offline',description:'Captured items and recovery',icon:'sync'},
  {key:'help',title:'Help & feedback',description:'Report a problem or share ideas',icon:'help'},
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
    <TextAction icon="back" label="Library" onPress={()=>router.dismissTo('/(account)')}/>
    <Type title>Your RecallBox.</Type>
    <Type muted>Account and personal choices.</Type>
    {!!error&&<Notice kind="error">{error}</Notice>}
    {!!message&&<Notice>{message}</Notice>}
    <View style={{gap: tokens.space.small}}>
      {sections.map(item=><View key={item.key} style={{gap: tokens.space.tiny}}>
        <Pressable accessibilityRole="button" accessibilityLabel={item.title}
          accessibilityState={{expanded:active===item.key}}
          onPress={()=>void select(item.key)}
          style={({pressed})=>({
            backgroundColor:pressed?p.surfaceMuted:p.surface,
            minHeight:76,padding: tokens.space.compact,borderRadius: tokens.radii.tile,
            borderWidth:1,borderColor:p.line,
            flexDirection:'row',alignItems:'center',gap: tokens.space.compact,
          })}>
          <View importantForAccessibility="no-hide-descendants"
            style={{height:43,width:43,borderRadius: tokens.radii.tile,backgroundColor:p.surfaceMuted,
              justifyContent:'center',alignItems:'center'}}>
            <Icon name={item.icon} color={p.brand}/>
          </View>
          <View style={{flex:1,gap: tokens.space.tiny}}>
            <Type variant="label">{item.title}</Type>
            <Type muted variant="caption">{item.description}</Type>
          </View>
          <Icon name={active===item.key?'down':'chevron'} color={p.mutedText}/>
        </Pressable>
        {active===item.key&&<View style={{backgroundColor:p.surfaceMuted,
          borderRadius: tokens.radii.tile,padding: tokens.space.medium,gap: tokens.space.small}}>
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
