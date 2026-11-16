package expo.modules.recallboxcallback

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.InputStream
import java.security.KeyStore
import java.util.UUID
import java.util.concurrent.CopyOnWriteArraySet
import javax.crypto.Cipher
import javax.crypto.CipherInputStream
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import org.json.JSONArray
import org.json.JSONObject

/** Encrypted device outbox. Never interpret unreadable storage as an empty inbox. */
object ShareStore {
  private const val ALIAS = "recallbox.share.v1"
  const val MAX_BYTES = 8 * 1024 * 1024
  val mimeTypes = setOf("image/jpeg", "image/png", "image/webp", "application/pdf")
  val listeners = CopyOnWriteArraySet<() -> Unit>()
  @Volatile private var sessionDisabled = false
  private fun prefs(c: Context) = c.getSharedPreferences(ALIAS, Context.MODE_PRIVATE)
  private fun directory(c: Context) = File(c.noBackupFilesDir, "share-outbox").apply { check(exists() || mkdirs()) }
  private fun key(): SecretKey {
    val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
      init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
    }.generateKey()
  }
  private fun encrypt(bytes: ByteArray): ByteArray {
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
    return cipher.iv + cipher.doFinal(bytes)
  }
  private fun decrypt(bytes: ByteArray): ByteArray {
    require(bytes.size >= 28)
    val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply {
      init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
    }
    return cipher.doFinal(bytes.copyOfRange(12, bytes.size))
  }
  private fun read(c: Context): JSONArray {
    val value = prefs(c).getString("queue", null) ?: return JSONArray()
    val items = JSONArray(String(decrypt(Base64.decode(value, Base64.NO_WRAP)), Charsets.UTF_8))
    // Preserve legacy URL keys and account ownership; never discard on account switch.
    for (i in 0 until items.length()) {
      val item = items.getJSONObject(i)
      if (!item.has("kind")) {
        item.put("kind", "url").put("status", "pending").put("delivery", item.getString("key"))
          .put("owner", prefs(c).getString("active_account", null) ?: JSONObject.NULL)
          .put("created", System.currentTimeMillis())
      }
    }
    return items
  }
  private fun write(c: Context, items: JSONArray) {
    val encoded = Base64.encodeToString(encrypt(items.toString().toByteArray(Charsets.UTF_8)), Base64.NO_WRAP)
    check(prefs(c).edit().putString("queue", encoded).commit()) { "Device storage unavailable" }
  }
  fun changed() { listeners.forEach { try { it() } catch (_: Exception) {} } }
  @Synchronized fun session(c: Context): JSONObject? {
    if (sessionDisabled) return null
    val value = prefs(c).getString("session", null) ?: return null
    return JSONObject(String(decrypt(Base64.decode(value, Base64.NO_WRAP)), Charsets.UTF_8))
  }
  @Synchronized fun setSession(c: Context, origin: String, owner: String, access: String, expires: Long) {
    sessionDisabled = true
    val items = read(c) // Migrate legacy ownership before changing active_account.
    val uri = java.net.URI(origin)
    val debug = c.applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE != 0
    require(uri.scheme == "https" || (debug && uri.scheme == "http" && uri.host in listOf("127.0.0.1", "localhost", "10.0.2.2")))
    require(uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null && uri.path.orEmpty() in listOf("", "/"))
    require(!uri.host.isNullOrBlank() && owner.isNotBlank() && owner.length <= 256 && access.isNotBlank() && access.length <= 16384)
    val value = JSONObject().put("origin", origin.trimEnd('/')).put("owner", owner).put("access", access).put("expires", expires)
    for (i in 0 until items.length()) {
      val item = items.getJSONObject(i)
      if (item.isNull("owner") && item.optString("status") != "saved") item.put("owner", owner)
      if (item.optString("owner") == owner && item.optBoolean("authRequired"))
        item.put("blocked", false).put("authRequired", false).put("error", "")
    }
    // Ownership migration and credentials must commit together, including legacy records.
    check(prefs(c).edit()
      .putString("session",Base64.encodeToString(encrypt(value.toString().toByteArray()),Base64.NO_WRAP))
      .putString("queue",Base64.encodeToString(encrypt(items.toString().toByteArray()),Base64.NO_WRAP))
      .putString("active_account",owner).commit())
    sessionDisabled = false
    changed()
  }
  @Synchronized fun clearSession(c: Context) {
    sessionDisabled = true
    // Retain last-owner metadata solely to migrate old encrypted URL records.
    check(prefs(c).edit().remove("session").commit())
    changed()
  }
  private fun owner(c: Context): Any = session(c)?.optString("owner") ?: JSONObject.NULL
  private fun visible(c: Context, item: JSONObject): Boolean = item.isNull("owner") || item.optString("owner") == session(c)?.optString("owner")
  @Synchronized fun list(c: Context, expectedOwner: String): JSONArray {
    if (session(c)?.optString("owner") != expectedOwner) return JSONArray()
    val out = JSONArray(); val items = read(c)
    for (i in 0 until items.length()) {
      val item = items.getJSONObject(i)
      if (item.optString("status") == "saved" || !visible(c, item)) continue
      out.put(JSONObject().put("key", item.getString("key")).put("kind", item.getString("kind"))
        .put("title", item.optString("title", "Shared item")).put("error", item.optString("error"))
        .put("created", item.optLong("created")).put("blocked", item.optBoolean("blocked")))
    }
    return out
  }
  @Synchronized fun pending(c: Context, owner: String): List<JSONObject> {
    val out = mutableListOf<JSONObject>(); val items = read(c)
    for (i in 0 until items.length()) {
      val item = items.getJSONObject(i)
      if (item.optString("status") != "saved" && item.optString("owner") == owner && !item.optBoolean("blocked")) out.add(item)
    }
    return out
  }
  @Synchronized fun claim(c: Context, id: String, owner: String): JSONObject? {
    val item = pending(c, owner).firstOrNull { it.getString("key") == id } ?: return null
    return if (ShareSync.inFlight.add(id)) item else null
  }
  @Synchronized fun delivery(c: Context, id: String): List<JSONObject> {
    val out = mutableListOf<JSONObject>(); val items = read(c)
    for (i in 0 until items.length()) if (items.getJSONObject(i).optString("delivery") == id) out.add(items.getJSONObject(i))
    return out
  }
  @Synchronized fun mark(c: Context, id: String, saved: Boolean, error: String = "", blocked: Boolean = false, authRequired: Boolean = false) {
    val items = read(c)
    for (i in 0 until items.length()) {
      val item = items.getJSONObject(i)
      if (item.optString("key") != id) continue
      item.put("error", error).put("blocked", blocked).put("authRequired",authRequired)
      if (saved) {
        val file = item.optString("file")
        item.put("status", "saved").put("completed", System.currentTimeMillis())
        // Commit a receipt BEFORE removing encrypted payload bytes.
        for (field in listOf("url", "text", "file", "mime", "size")) item.remove(field)
        write(c, items)
        if (file.isNotEmpty()) File(directory(c), file).delete()
        changed(); return
      }
    }
    write(c, items); changed()
  }
  @Synchronized fun retry(c: Context, expectedOwner: String) {
    require(session(c)?.optString("owner") == expectedOwner) { "Sign in again before retrying" }
    val items = read(c)
    for (i in 0 until items.length()) if (visible(c, items.getJSONObject(i))) items.getJSONObject(i).put("blocked", false).put("error", "")
    write(c, items); changed()
  }
  @Synchronized fun discard(c: Context, id: String, expectedOwner: String): Boolean {
    if (session(c)?.optString("owner") != expectedOwner) return false
    if (ShareSync.inFlight.contains(id)) return false
    val items = read(c); val remaining = JSONArray(); var removed: JSONObject? = null
    for (i in 0 until items.length()) {
      val item = items.getJSONObject(i)
      if (item.optString("key") == id && visible(c, item) && item.optString("status") != "saved") removed = item
      else remaining.put(item)
    }
    if (removed == null) return false
    write(c, remaining)
    removed.optString("file").takeIf { it.isNotEmpty() }?.let { File(directory(c), it).delete() }
    changed(); return true
  }
  fun openFile(c: Context, item: JSONObject): InputStream {
    val name = item.getString("file"); require(Regex("[a-f0-9-]+\\.enc").matches(name))
    val input = FileInputStream(File(directory(c), name)); val iv = ByteArray(12)
    try {
      require(input.read(iv) == iv.size)
      val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
      return CipherInputStream(input, cipher)
    } catch (e: Exception) { input.close(); throw e }
  }
  private fun copy(c: Context, uri: Uri, mime: String, id: String): Pair<String, Long> {
    require(uri.scheme == "content") { "Only granted content URIs are supported" }
    require(mime in mimeTypes) { "Unsupported file format" }
    val target = File(directory(c), "$id.enc"); val temp = File(directory(c), "$id.part")
    var count = 0L; val header = java.io.ByteArrayOutputStream()
    try {
      c.contentResolver.openInputStream(uri).use { input ->
        requireNotNull(input) { "File permission unavailable" }
        FileOutputStream(temp).use { output ->
          val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
          output.write(cipher.iv)
          val buffer = ByteArray(32768)
          while (true) {
            val size = input.read(buffer); if (size < 0) break
            count += size; require(count <= MAX_BYTES) { "Files must be 8 MiB or smaller" }
            if (header.size() < 12) header.write(buffer, 0, minOf(size, 12 - header.size()))
            cipher.update(buffer, 0, size)?.let { output.write(it) }
          }
          require(count > 0 && SharePayload.matches(mime, header.toByteArray())) { "File type does not match its contents" }
          output.write(cipher.doFinal()); output.fd.sync()
        }
      }
      check(temp.renameTo(target)) { "Device storage unavailable" }
      val fd = android.system.Os.open(directory(c).path,android.system.OsConstants.O_RDONLY,0)
      try {android.system.Os.fsync(fd)} finally {android.system.Os.close(fd)}
      return target.name to count
    } catch (e: Exception) { temp.delete(); target.delete(); throw e }
  }
  @Suppress("DEPRECATION")
  @Synchronized fun receive(c: Context, intent: Intent, delivery: String): List<JSONObject> {
    delivery(c, delivery).takeIf { it.isNotEmpty() }?.let { return it }
    require(intent.action in listOf(Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)) { "Unsupported share action" }
    val items = read(c); var pendingCount = 0
    for (i in 0 until items.length()) if (items.getJSONObject(i).optString("status") != "saved") pendingCount++
    val created = mutableListOf<JSONObject>(); val copied = mutableListOf<String>()
    try {
      fun record(kind: String) = JSONObject().put("key", UUID.randomUUID().toString()).put("delivery", delivery)
        .put("owner", owner(c)).put("kind", kind).put("status", "pending").put("created", System.currentTimeMillis())
      if (intent.type?.substringBefore(';') == "text/plain" && intent.action == Intent.ACTION_SEND) {
        val parsed = SharePayload.parse(intent.getCharSequenceExtra(Intent.EXTRA_TEXT)?.toString().orEmpty(),
          intent.getCharSequenceExtra(Intent.EXTRA_SUBJECT)?.toString().orEmpty())
        val item = record(if (parsed.url != null) "url" else "text").put("text",parsed.content).put("title",parsed.title)
        parsed.url?.let { item.put("url",it) }
        created.add(item)
      } else {
        val streams = if (intent.action == Intent.ACTION_SEND_MULTIPLE)
          intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
        else listOfNotNull(intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM))
        val uris = streams.ifEmpty { (0 until (intent.clipData?.itemCount ?: 0)).mapNotNull { intent.clipData?.getItemAt(it)?.uri } }
        require(uris.size in 1..10) { "Share between 1 and 10 supported files" }
        for (uri in uris) {
          val mime = c.contentResolver.getType(uri)?.substringBefore(';') ?: intent.type.orEmpty()
          val item = record(if (mime == "application/pdf") "pdf" else "image")
          val id = item.getString("key")
          val (file, size) = copy(c, uri, mime, id); copied.add(file)
          var name = if (mime == "application/pdf") "Shared document.pdf" else "Shared image"
          try {
            c.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
              if (cursor.moveToFirst()) cursor.getString(0)?.takeIf { it.isNotBlank() }?.let { name = it.take(240) }
            }
          } catch (_: Exception) { /* A readable stream need not expose a display name. */ }
          created.add(item.put("file", file).put("size", size).put("mime", mime).put("title", name))
        }
      }
      require(pendingCount + created.size <= 20) { "The device inbox is full. Sync existing shares first" }
      // Keep bounded receipts for recreation/re-delivery; intentional later shares get a fresh delivery ID.
      val retained = JSONArray(); val receipts = mutableListOf<JSONObject>()
      for (i in 0 until items.length()) {
        val item = items.getJSONObject(i)
        if (item.optString("status") == "saved") receipts.add(item) else retained.put(item)
      }
      receipts.takeLast(100).forEach { retained.put(it) }; created.forEach { retained.put(it) }
      write(c, retained); changed(); return created
    } catch (e: Exception) { copied.forEach { File(directory(c), it).delete() }; throw e }
  }
}
