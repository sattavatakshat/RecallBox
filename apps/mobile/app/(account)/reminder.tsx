import {useRef, useState} from 'react';
import {Alert} from 'react-native';
import {router, useLocalSearchParams} from 'expo-router';
import * as Crypto from 'expo-crypto';
import {ApiError, remindersApi} from '../../src/api';
import {useSession} from '../../src/session';
import {Button, Input, Notice, Screen, TextAction, Type} from '../../src/ui';

type Attempt = {key:string;dueAt:string;timeZone:string;memoryId:string};

function localTimeZone(){
  try {return Intl.DateTimeFormat().resolvedOptions().timeZone||'';}
  catch {return '';}
}
function localDue(date:string,time:string):string|null{
  const d=/^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t=/^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if(!d||!t)return null;
  const year=Number(d[1]),month=Number(d[2]),day=Number(d[3]);
  const hour=Number(t[1]),minute=Number(t[2]);
  if(year<2000||year>9999)return null;
  const value=new Date(year,month-1,day,hour,minute,0,0);
  if(value.getFullYear()!==year||value.getMonth()!==month-1||
    value.getDate()!==day||value.getHours()!==hour||value.getMinutes()!==minute)return null;
  if(value.getTime()<=Date.now()+60000||value.getTime()>Date.now()+365*5*86400000)return null;
  return value.toISOString();
}

/** RB-18: an actual account-persisted reminder, not an imaginary push alert. */
export default function NewReminder(){
  const {memoryId}=useLocalSearchParams<{memoryId:string}>();
  const {authorized}=useSession();
  const [date,setDate]=useState('');
  const [time,setTime]=useState('19:00');
  const [busy,setBusy]=useState(false);
  const [locked,setLocked]=useState(false);
  const [error,setError]=useState('');
  const attempt=useRef<Attempt|null>(null);
  const timeZone=localTimeZone();
  const canSave=!!memoryId&&!!date&&!!timeZone&&(!locked||!!attempt.current);
  function back(){
    if(!date||locked){router.back();return;}
    Alert.alert('Discard reminder?', 'Your chosen date and time have not been saved.',[
      {text:'Keep editing',style:'cancel'},
      {text:'Discard',style:'destructive',onPress:()=>router.back()},
    ]);
  }
  async function save(){
    if(!canSave||busy||!memoryId)return;
    const due=localDue(date,time);
    if(!attempt.current&&!due){
      setError('Enter a real future date (YYYY-MM-DD) and time (HH:mm) in your device timezone.');
      return;
    }
    if(!attempt.current)attempt.current={
      key:Crypto.randomUUID(),dueAt:due!,timeZone,memoryId,
    };
    const request=attempt.current;
    setLocked(true);setBusy(true);setError('');
    try{
      await authorized(access=>remindersApi.create(access,request.memoryId,{
        request_key:request.key,due_at:request.dueAt,time_zone:request.timeZone,
      }));
      router.replace('/(account)/reminders');
    }catch(cause){
      if(cause instanceof ApiError&&cause.status===422){
        setLocked(false);attempt.current=null;
        setError('The date or timezone was rejected. Review the reminder and retry.');
      }else{
        setError('Save was not confirmed. Retry keeps the same reminder key to avoid duplicates.');
      }
    }finally{setBusy(false);}
  }
  return <Screen compact>
    <TextAction icon="back" label="Memory" onPress={back}/>
    <Type title>Remind me.</Type>
    <Type muted>Bring a saved thing back at the right moment.</Type>
    {!memoryId&&<Notice kind="error">Open a saved memory to create a reminder.</Notice>}
    <Input label="Date" value={date} editable={!busy&&!locked}
      onChangeText={setDate} placeholder="YYYY-MM-DD" maxLength={10}
      keyboardType="numbers-and-punctuation" autoCorrect={false}/>
    <Input label="Time" value={time} editable={!busy&&!locked}
      onChangeText={setTime} placeholder="19:00" maxLength={5}
      keyboardType="numbers-and-punctuation" autoCorrect={false}/>
    <Type muted variant="caption">Time zone: {timeZone||'unavailable'} (your device's local time).
      Reminders are stored in RecallBox. Android push notifications are not enabled yet.</Type>
    {!!error&&<Notice kind="error">{error}</Notice>}
    {locked&&!busy&&<Notice>Your last save may already have succeeded. Retry uses the same request key.</Notice>}
    <Button label={locked?'Retry saving reminder':'Save reminder'} busy={busy}
      disabled={!canSave} onPress={()=>void save()}/>
    <TextAction label="View my reminders" onPress={()=>router.push('/(account)/reminders')}/>
  </Screen>;
}
