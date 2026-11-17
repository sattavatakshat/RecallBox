import {Platform} from 'react-native';
import {requireOptionalNativeModule} from 'expo';
import {File,FileMode,Paths} from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import {CaptureFile,MAX_CAPTURE_BYTES,captureMIME} from './manual-save-model';

type NativeImagePicker={pickManualImage?:(owner:string)=>Promise<CaptureFile|null>;getPendingManualImage?:(owner:string)=>Promise<CaptureFile|null>};
const native=Platform.OS==='android'?requireOptionalNativeModule<NativeImagePicker>('RecallBoxCallback'):null;

export async function inspectSelection(uri: string,name: string,mode: 'image'|'pdf'|'capture'): Promise<CaptureFile> {
  // DocumentPicker copies granted content URIs into cache. The native photo bridge does the same.
  const file=new File(uri);
  if(!file.exists)throw new Error('This selection is no longer available. Choose it again.');
  const handle=file.open(FileMode.ReadOnly);
  try {
    const size=handle.size??0;
    if(size<=0)throw new Error(`${name}: this file is empty or unreadable.`);
    if(size>MAX_CAPTURE_BYTES)throw new Error(`${name}: choose a file up to 8 MiB.`);
    const mime=captureMIME(await handle.readBytes(12));
    if(!mime || (mode==='image'&&mime==='application/pdf') || (mode==='pdf'&&mime!=='application/pdf'))
      throw new Error(`${name}: choose ${mode==='pdf'?'a PDF':mode==='image'?'a JPG, PNG or WebP image':'a JPG, PNG, WebP or PDF file'}.`);
    return {uri:file.uri,name:name.slice(0,240)||'Selected file',size,mime};
  } finally {handle.close();}
}
export async function choosePhoto(owner: string): Promise<CaptureFile|null> {
  if(Platform.OS==='android') {
    if(!native?.pickManualImage)throw new Error('This version needs an update for the photo picker. Use Choose from Files instead.');
    return native.pickManualImage(owner);
  }
  const result=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],quality:1,allowsEditing:false});
  if(result.canceled||!result.assets[0])return null;
  const asset=result.assets[0];return inspectSelection(asset.uri,asset.fileName||'Selected photo','image');
}
let cameraOwner: string | null=null;
export async function recoverPhoto(owner: string): Promise<CaptureFile|null> {
  const pending=await native?.getPendingManualImage?.(owner);
  if(pending)return pending;
  if(cameraOwner!==owner)return null;
  const camera=await ImagePicker.getPendingResultAsync();
  if(camera&&'assets' in camera&&camera.assets?.[0]) {
    cameraOwner=null;
    const asset=camera.assets[0];return inspectSelection(asset.uri,asset.fileName||'Selected photo','image');
  }
  return null;
}
export async function chooseCamera(owner: string): Promise<CaptureFile|null> {
  if(!(await ImagePicker.requestCameraPermissionsAsync()).granted)
    throw new Error('Camera access is needed only to take a photo. You can choose an existing image instead.');
  cameraOwner=owner;
  const result=await ImagePicker.launchCameraAsync({mediaTypes:['images'],quality:1,allowsEditing:false});
  cameraOwner=null;
  if(result.canceled||!result.assets[0])return null;
  const asset=result.assets[0];return inspectSelection(asset.uri,asset.fileName||'Camera photo.jpg','image');
}
export async function chooseDocument(kind: 'image'|'pdf'): Promise<CaptureFile|null> {
  const result=await DocumentPicker.getDocumentAsync({type:kind==='pdf'?'application/pdf':
    ['image/jpeg','image/png','image/webp'],copyToCacheDirectory:true,multiple:false});
  if(result.canceled||!result.assets[0])return null;
  const asset=result.assets[0];return inspectSelection(asset.uri,asset.name,kind);
}
export function removeCachedSelection(file: CaptureFile) {
  try {if(file.uri.startsWith(Paths.cache.uri))new File(file.uri).delete();}catch{/* Cache cleanup never negates a server save. */}
}
export function selectionError(cause: unknown): string {
  const message=cause instanceof Error?cause.message:'';
  if(message.includes('8 MiB'))return 'Choose a file up to 8 MiB.';
  if(message.includes('JPG'))return 'Choose a JPG, PNG or WebP image.';
  if(message.includes('a PDF'))return 'Choose a PDF document.';
  if(message.includes('Camera access')||message.includes('needs an update')||
      message.includes('no longer available')||message.includes('empty or unreadable'))return message;
  return 'Could not read that selection. Try again or choose it from Files.';
}
