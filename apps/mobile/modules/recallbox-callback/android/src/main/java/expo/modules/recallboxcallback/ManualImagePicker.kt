package expo.modules.recallboxcallback

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.File
import java.util.UUID

/** Unlike the pinned Expo picker, parsing a result never queries a provider on the UI thread. */
class ManualImageContract : AppContextActivityResultContract<String, Uri?> {
  override fun createIntent(context: Context, input: String): Intent {
    if(Build.VERSION.SDK_INT>=33) {
      return Intent("android.provider.action.PICK_IMAGES").setType("image/*")
    }
    return Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*")
      .putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("image/jpeg","image/png","image/webp"))
  }
  override fun parseResult(input: String, resultCode: Int, intent: Intent?): Uri? =
    if(resultCode==Activity.RESULT_OK) intent?.data else null
}

object ManualImagePicker {
  /** Runs on Dispatchers.IO. Grants are copied before resolving back to the preview editor. */
  fun copy(context: Context, uri: Uri): Map<String,Any> {
    require(uri.scheme=="content") {"Choose an image from the system picker"}
    val output=File(context.cacheDir,"manual-pick-${UUID.randomUUID()}")
    var size=0L
    try {
      var mime=""
      context.contentResolver.openInputStream(uri).use { source ->
        requireNotNull(source) {"The image could not be opened"}
        val header=ByteArray(12);var used=0
        while(used<header.size){val n=source.read(header,used,header.size-used);if(n<0)break;used+=n}
        mime=listOf("image/jpeg","image/png","image/webp").firstOrNull {SharePayload.matches(it,header.copyOf(used))}
          ?: throw IllegalArgumentException("Choose a JPG, PNG or WebP image")
        output.outputStream().use { sink ->
          sink.write(header,0,used);size=used.toLong();val buffer=ByteArray(32768)
          while(true){val n=source.read(buffer);if(n<0)break;size+=n
            require(size<=ShareStore.MAX_BYTES) {"Choose an image up to 8 MiB"};sink.write(buffer,0,n)}
        }
      }
      var name="Selected image."+when(mime){"image/png"->"png";"image/webp"->"webp";else->"jpg"}
      try {context.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use {
        if(it.moveToFirst())it.getString(0)?.takeIf {value->value.isNotBlank()}?.let {value->name=value.take(240)}
      }}catch(_:Exception){/* Display metadata is optional; only image bytes are required. */}
      return mapOf("uri" to Uri.fromFile(output).toString(),"name" to name,"size" to size,"mime" to mime)
    }catch(e:Exception){output.delete();throw e}
  }
}
