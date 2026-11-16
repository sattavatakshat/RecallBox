package expo.modules.recallboxcallback

/** Pure validation shared by the receiver and lightweight JVM checks. */
object SharePayload {
  data class Text(val content: String, val title: String, val url: String?)
  fun parse(content: String, subject: String): Text {
    require(content.isNotBlank() && content.length <= 100000) { "Share non-empty text up to 100,000 characters" }
    val urls = Regex("""https?://[^\s<>"']+""", RegexOption.IGNORE_CASE).findAll(content).map { it.value }.toList()
    val title = subject.take(240)
    if (urls.size != 1) return Text(content,title.ifBlank { "Shared text" },null)
    val url = urls[0]
    val uri = try { java.net.URI(url) } catch (_: Exception) { throw IllegalArgumentException("Invalid web link") }
    require(url.length in 10..4096 && uri.scheme.lowercase() in listOf("http", "https") && !uri.host.isNullOrBlank()
      && uri.rawUserInfo == null && uri.port in listOf(-1,80,443) && !url.contains('\\')) { "Share a complete public HTTP(S) link" }
    return Text(content,title.ifBlank { uri.host },url)
  }
  fun matches(mime: String, bytes: ByteArray): Boolean = when (mime) {
    "application/pdf" -> bytes.take(5).toByteArray().contentEquals("%PDF-".toByteArray())
    "image/png" -> bytes.take(8).toByteArray().contentEquals(byteArrayOf(-119,80,78,71,13,10,26,10))
    "image/jpeg" -> bytes.size >= 3 && bytes[0] == (-1).toByte() && bytes[1] == (-40).toByte() && bytes[2] == (-1).toByte()
    "image/webp" -> bytes.size >= 12 && String(bytes,0,4) == "RIFF" && String(bytes,8,4) == "WEBP"
    else -> false
  }
}
