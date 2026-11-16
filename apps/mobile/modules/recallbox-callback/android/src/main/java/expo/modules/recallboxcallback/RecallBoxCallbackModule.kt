package expo.modules.recallboxcallback

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONObject

// The development launcher replaces the Activity intent during cold startup.
// Preserve only the callback, encrypted with a device-local key; PKCE verifier
// and nonce remain separately in Expo SecureStore and are always revalidated.
object CallbackStore {
  private const val ALIAS = "recallbox.callback.v1"
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  @JvmStatic fun save(context: Context, uri: Uri?) {
    if (uri?.scheme != "app.recallbox.mobile" || uri.host != "auth" || uri.path != "/callback" ||
        uri.toString().length > 8192 || uri.getQueryParameter("state") == null) return
    try {
      val plain = JSONObject().put("url",uri.toString()).put("created",System.currentTimeMillis()).toString().toByteArray(Charsets.UTF_8)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE,key()) }
      val encrypted = cipher.iv + cipher.doFinal(plain)
      context.getSharedPreferences(ALIAS,Context.MODE_PRIVATE).edit().putString("pending",Base64.encodeToString(encrypted,Base64.NO_WRAP)).commit()
    } catch (_: Exception) { /* Fail closed; the caller can restart sign-in. */ }
  }
  @JvmStatic fun consume(context: Context): String? {
    val prefs = context.getSharedPreferences(ALIAS,Context.MODE_PRIVATE)
    val saved = prefs.getString("pending",null) ?: return null
    prefs.edit().remove("pending").commit()
    return try {
      val bytes = Base64.decode(saved,Base64.NO_WRAP)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,bytes.copyOfRange(0,12))) }
      val value = JSONObject(String(cipher.doFinal(bytes.copyOfRange(12,bytes.size)),Charsets.UTF_8))
      val age = System.currentTimeMillis()-value.getLong("created")
      if (age in 0..600000) value.getString("url") else null
    } catch (_: Exception) { null }
  }
}

class RecallBoxCallbackModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("RecallBoxCallback")
    AsyncFunction("consumeCallback") { appContext.reactContext?.let { CallbackStore.consume(it) } }
    AsyncFunction("activateShareAccount") { id: String -> appContext.reactContext?.let { ShareStore.activateAccount(it, id) } ?: false }
    AsyncFunction("peekShare") { appContext.reactContext?.let { ShareStore.peek(it) } }
    AsyncFunction("acknowledgeShare") { id: String -> appContext.reactContext?.let { ShareStore.acknowledge(it, id) } ?: false }
    AsyncFunction("finishShare") {
      val activity = appContext.currentActivity
      if (activity?.intent?.action == android.content.Intent.ACTION_SEND) {
        activity.runOnUiThread { activity.finish() }
        true
      } else false
    }
  }
}
