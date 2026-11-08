import { useRef, useState } from 'react';
import { router } from 'expo-router';
import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { memoriesApi, Memory } from '../../src/api';
import { useSession } from '../../src/session';
import { useMemories } from '../../src/memories';
import { Button, Input, Notice, Screen, TextAction, Type } from '../../src/ui';

type Intent = {key: string; url?: string; uri?: string; mime?: string; name?: string};
export default function Capture() {
  const {authorized} = useSession();
  const store = useMemories();
  const [url,setUrl] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('Articles, screenshots, photos and PDFs. Originals are saved privately. Files up to 8 MiB.');
  const [pending,setPending] = useState<Intent | null>(null);
  const lock = useRef(false);
  async function save(intent: Intent) {
    if(lock.current) return;
    lock.current=true; setBusy(true); setPending(intent); setMessage('Saving your source…');
    try {
      const saved: Memory = await authorized(access => intent.url
        ? memoriesApi.capture(access,intent.url,intent.key)
        : memoriesApi.upload(access,intent.uri!,intent.mime!,intent.name!,intent.key));
      if(intent.uri) { try {new File(intent.uri).delete();} catch {} }
      setPending(null);
      await store.refresh(false).catch(() => undefined);
      router.replace({pathname:'/(account)/memory/[id]',params:{id:saved.id,saved:'1'}});
    } catch {setMessage('Could not confirm this save. Retry sends the same request safely. Check file type, size and your connection.');}
    finally {lock.current=false; setBusy(false);}
  }
  async function choose(camera: boolean) {
    // The Android 16 Photo Picker performs a synchronous MIME query on the
    // activity thread in this Expo version. DocumentsUI avoids that ANR path.
    if (!camera) {await document(true);return;}
    try {
      if(camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {setMessage('Camera access is needed to take a photo. You can choose an existing image instead.'); return;}
      const result = camera ? await ImagePicker.launchCameraAsync({quality:0.8,mediaTypes:['images']})
        : await ImagePicker.launchImageLibraryAsync({quality:0.8,mediaTypes:['images']});
      if(result.canceled) return;
      const asset=result.assets[0]; if(!asset) return;
      await save({key:Crypto.randomUUID(),uri:asset.uri,mime:asset.mimeType || 'image/jpeg',name:asset.fileName || 'Captured photo.jpg'});
    } catch {setMessage('The image could not be opened. Try another file.');}
  }
  async function document(imagesOnly=false) {
    try {
      const result=await DocumentPicker.getDocumentAsync({type:imagesOnly?['image/png','image/jpeg','image/webp']:['application/pdf','image/png','image/jpeg','image/webp'],copyToCacheDirectory:true,multiple:false});
      if(result.canceled) return;
      const asset=result.assets[0]; if(!asset) return;
      await save({key:Crypto.randomUUID(),uri:asset.uri,mime:asset.mimeType || 'application/octet-stream',name:asset.name});
    } catch {setMessage('The file could not be opened. Try another file.');}
  }
  return <Screen><TextAction label="Back to library" disabled={busy} onPress={() => router.back()}/>
    <Type title>Keep something.</Type><Notice>{message}</Notice>
    {pending ? <><Button label="Retry this save" busy={busy} onPress={() => void save(pending)}/>
      <TextAction label="Start another capture" disabled={busy} onPress={() => {setPending(null);setMessage('Previous save may have succeeded. Check the library before saving it again.');}}/></> : <>
      <Input label="Public article URL" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" maxLength={4096} placeholder="https://…"/>
      <Button label="Save URL" disabled={!/^https?:\/\//i.test(url.trim())} busy={busy} onPress={() => void save({key:Crypto.randomUUID(),url:url.trim()})}/>
      <Button label="Choose image or screenshot" disabled={busy} onPress={() => void choose(false)}/>
      <Button label="Take a photo" disabled={busy} onPress={() => void choose(true)}/>
      <Button label="Upload PDF or image" disabled={busy} onPress={() => void document()}/>
      <Type muted>Restricted pages retain their URL and available metadata. Images are saved as originals; text recognition is not available yet.</Type>
    </>}
  </Screen>;
}
