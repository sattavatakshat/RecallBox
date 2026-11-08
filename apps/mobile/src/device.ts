import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
export async function deviceId() {
  let id = await SecureStore.getItemAsync('recallbox.device.v1');
  if (!id) {
    id = Crypto.randomUUID();
    await SecureStore.setItemAsync('recallbox.device.v1', id, {keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY});
  }
  return id;
}
