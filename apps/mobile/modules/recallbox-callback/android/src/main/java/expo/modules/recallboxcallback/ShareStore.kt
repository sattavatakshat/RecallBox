package expo.modules.recallboxcallback

import android.content.Context
import android.content.Intent
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import org.json.JSONArray
import org.json.JSONObject

/** Device-encrypted, bounded share inbox. Server confirmation precedes acknowledgement. */
object ShareStore {
  private const val ALIAS = "recallbox.share.v1"
  private fun prefs(context: Context) = context.getSharedPreferences(ALIAS, Context.MODE_PRIVATE)
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  private fun read(context: Context): JSONArray {
    val value = prefs(context).getString("queue", null) ?: return JSONArray()
    return try {
      val bytes = Base64.decode(value, Base64.NO_WRAP)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
        init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
      }
      JSONArray(String(cipher.doFinal(bytes.copyOfRange(12, bytes.size)), Charsets.UTF_8))
    } catch (_: Exception) { JSONArray() }
  }
  private fun write(context: Context, items: JSONArray): Boolean {
    return try {
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
      val encrypted = cipher.iv + cipher.doFinal(items.toString().toByteArray(Charsets.UTF_8))
      prefs(context).edit().putString("queue", Base64.encodeToString(encrypted, Base64.NO_WRAP)).commit()
    } catch (_: Exception) { false }
  }
  /**
   * Device-local inbox must never be silently imported under another account.
   * An account switch clears pending shares before the new account may peek.
   */
  @JvmStatic @Synchronized fun activateAccount(context: Context, id: String): Boolean {
    if (id.isBlank() || id.length > 256) return false
    val previous = prefs(context).getString("active_account", null)
    if (previous != null && previous != id && !write(context, JSONArray())) return false
    return prefs(context).edit().putString("active_account", id).commit()
  }
  @JvmStatic @Synchronized fun save(context: Context, intent: Intent?) {
    if (intent?.action != Intent.ACTION_SEND || intent.type != "text/plain") return
    val text = intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString()?.trim() ?: return
    if (text.length > 8192) return
    // Android shares often include a title on one line and a URL on the next.
    // Reject ambiguous shares containing multiple URLs rather than selecting one silently.
    val urls = Regex("""https?://[^\s<>"']+""", RegexOption.IGNORE_CASE)
      .findAll(text).map { it.value.trimEnd('.', ',', ';', '!', '?', ')') }.toList()
    if (urls.size != 1) return
    val candidate = urls[0]
    if (candidate.length !in 8..4096 || candidate.contains('\\')) return
    val uri = try { android.net.Uri.parse(candidate) } catch (_: Exception) { return }
    if (uri.scheme?.lowercase() !in listOf("http", "https") || uri.host.isNullOrBlank()
      || uri.encodedAuthority?.contains('@') == true) return
    val items = read(context)
    for (i in 0 until items.length()) {
      if (items.optJSONObject(i)?.optString("url") == candidate) return
    }
    if (items.length() >= 20) return
    items.put(JSONObject().put("key", UUID.randomUUID().toString()).put("url", candidate))
    write(context, items)
  }
  @JvmStatic @Synchronized fun peek(context: Context): String? {
    val items = read(context)
    return if (items.length() > 0) items.optJSONObject(0)?.toString() else null
  }
  @JvmStatic @Synchronized fun acknowledge(context: Context, id: String): Boolean {
    val items = read(context)
    if (items.length() == 0 || items.optJSONObject(0)?.optString("key") != id) return false
    val remaining = JSONArray()
    for (i in 1 until items.length()) remaining.put(items.getJSONObject(i))
    return write(context, remaining)
  }
}
