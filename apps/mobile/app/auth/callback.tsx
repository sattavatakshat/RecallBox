import { router } from 'expo-router';
import { Button, Screen, Type } from '../../src/ui';
export default function Callback() {
  return <Screen><Type title>Returning to your space.</Type><Type muted>If sign-in was interrupted, start again to keep your account secure.</Type><Button label="Continue" onPress={() => router.replace('/sign-in')}/></Screen>;
}
