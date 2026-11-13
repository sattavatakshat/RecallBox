import { router } from 'expo-router';
import { Button, Screen, TextAction, Type } from '../../src/ui';

// Only live capture types are shown. Other media await their own trusted ingestion.
export default function SaveSomething() {
  return <Screen>
    <TextAction label="Back to library" onPress={() => router.replace('/(account)')}/>
    <Type>RECALLBOX / SAVE</Type>
    <Type title>Save something.</Type>
    <Type muted>Keep a useful link or a thought. They’ll be here when you need them.</Type>
    <Button label="Paste a link" onPress={() => router.push('/(account)/new-link')}/>
    <Button label="Write a note" variant="secondary" onPress={() => router.push('/(account)/new')}/>
    <Type muted>Photos, PDFs and other media need a separate, verified import flow before they appear here.</Type>
  </Screen>;
}
