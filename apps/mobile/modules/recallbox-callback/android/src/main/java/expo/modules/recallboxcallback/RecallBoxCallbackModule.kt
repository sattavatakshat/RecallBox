package expo.modules.recallboxcallback

import android.content.Context
import android.net.Uri
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.atomic.AtomicReference
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
  private lateinit var imagePicker: AppContextActivityResultLauncher<String, Uri?>
  private val pendingImage = AtomicReference<Pair<String,Uri>?>(null)
  override fun definition() = ModuleDefinition {
    Name("RecallBoxCallback")
    AsyncFunction("consumeCallback") { appContext.reactContext?.let { CallbackStore.consume(it) } }
    RegisterActivityContracts {
      imagePicker=registerForActivityResult(ManualImageContract()) { owner, uri ->
        if(uri!=null)pendingImage.set(owner to uri)
      }
    }
    AsyncFunction("pickManualImage") Coroutine { owner: String ->
      require(owner.isNotBlank())
      pendingImage.set(null)
      val uri=imagePicker.launch(owner)
      pendingImage.set(null)
      if(uri==null)return@Coroutine null
      withContext(Dispatchers.IO) {ManualImagePicker.copy(requireNotNull(appContext.reactContext),uri)}
    }
    AsyncFunction("getPendingManualImage") Coroutine { owner: String ->
      val pending=pendingImage.get()?.takeIf {it.first==owner} ?: return@Coroutine null
      if(!pendingImage.compareAndSet(pending,null))return@Coroutine null
      withContext(Dispatchers.IO) {ManualImagePicker.copy(requireNotNull(appContext.reactContext),pending.second)}
    }
    Events("shareInboxChanged")
    val listener: () -> Unit = { sendEvent("shareInboxChanged", emptyMap<String, Any>()) }
    OnCreate { ShareStore.listeners.add(listener) }
    OnDestroy { ShareStore.listeners.remove(listener) }
    AsyncFunction("setShareSession") { origin: String, owner: String, access: String, expires: Double ->
      val context = requireNotNull(appContext.reactContext)
      ShareStore.setSession(context,origin,owner,access,expires.toLong())
      ShareSync.schedule(context); ShareSync.request(context)
      true
    }
    AsyncFunction("clearShareSession") {
      appContext.reactContext?.let { ShareStore.clearSession(it) }
      true
    }
    AsyncFunction("listShares") { owner: String -> appContext.reactContext?.let { ShareStore.list(it,owner).toString() } ?: "[]" }
    AsyncFunction("retryShares") { owner: String ->
      val context = requireNotNull(appContext.reactContext)
      ShareStore.retry(context,owner); ShareSync.schedule(context); ShareSync.request(context)
      true
    }
    AsyncFunction("discardShare") { id: String, owner: String -> appContext.reactContext?.let { ShareStore.discard(it,id,owner) } ?: false }
  }
}
