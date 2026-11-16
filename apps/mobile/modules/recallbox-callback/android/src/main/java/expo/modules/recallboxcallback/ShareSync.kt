package expo.modules.recallboxcallback

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.util.Log
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import org.json.JSONObject

/** Reuses the existing authenticated/idempotent API, without a second refresh-token flow. */
object ShareSync {
  private const val JOB = 7303
  private val executor = Executors.newSingleThreadExecutor()
  private val running = AtomicBoolean(false)
  @Volatile private var activeConnection: HttpURLConnection? = null
  val inFlight: MutableSet<String> = ConcurrentHashMap.newKeySet()
  fun cancel() { activeConnection?.disconnect() }
  fun schedule(c: Context): Boolean = try {
    val job = JobInfo.Builder(JOB, ComponentName(c, ShareSyncJob::class.java))
      .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPersisted(true)
      .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL).build()
    c.getSystemService(JobScheduler::class.java).schedule(job) == JobScheduler.RESULT_SUCCESS
  } catch (_: Exception) { false }
  fun request(c: Context, done: (Boolean) -> Unit = {}) {
    val app = c.applicationContext
    executor.execute {
      if (!running.compareAndSet(false, true)) { done(true); return@execute }
      var retry = false
      try {
        val session = ShareStore.session(app)
        if (session != null && session.optLong("expires") > System.currentTimeMillis() + 30000) {
          for (pending in ShareStore.pending(app, session.getString("owner"))) {
            val id = pending.getString("key")
            val item = ShareStore.claim(app, id, session.getString("owner")) ?: continue
            try {
              val current = ShareStore.session(app)
              if (current?.optString("access") != session.getString("access")) break
              val status = send(app, session, item)
              if (status == 401) {
                ShareStore.mark(app,id,false,"Open RecallBox to renew your sign-in.",true,true)
                break
              }
              if (status in 200..299) {
                ShareStore.mark(app,id,true)
                Log.i("RecallBoxShare", "Server save confirmed")
              } else if (status == 429 || status >= 500) {
                ShareStore.mark(app,id,false,"Waiting to retry when the service is available.")
                retry = true; break
              } else {
                ShareStore.mark(app,id,false,"Server rejected this attempt ($status). Review before retrying.",true)
              }
            } catch (_: Exception) {
              ShareStore.mark(app,id,false,"Save not confirmed. The encrypted local copy is retained.")
              retry = true; break
            } finally { inFlight.remove(id) }
          }
        }
        // Expired/missing credentials wait for the existing app session to refresh.
        // They are never rotated here, avoiding competing refresh-token consumers.
      } catch (_: Exception) {
        Log.w("RecallBoxShare", "Outbox unavailable; no payload discarded")
        retry = true
      } finally { running.set(false); ShareStore.changed(); done(retry) }
    }
  }
  private fun send(c: Context, session: JSONObject, item: JSONObject): Int {
    val kind = item.getString("kind")
    val body = when (kind) {
      "url" -> JSONObject().put("url",item.getString("url")).apply {
        if (item.has("text")) put("shared_text",item.getString("text"))
        // Legacy URL records must retain their exact original request fingerprint.
        if (item.has("text")) put("title",item.getString("title"))
      }.toString().toByteArray(Charsets.UTF_8)
      "text" -> JSONObject().put("title",item.getString("title")).put("content",item.getString("text")).toString().toByteArray(Charsets.UTF_8)
      else -> null
    }
    val path = when (kind) {
      "url" -> "/v1/captures"
      "text" -> "/v1/memories"
      else -> "/v1/uploads?filename=" + URLEncoder.encode(item.getString("title"),"UTF-8")
    }
    val connection = URL(session.getString("origin") + path).openConnection() as HttpURLConnection
    activeConnection = connection
    try {
      connection.requestMethod = "POST"; connection.instanceFollowRedirects = false
      connection.connectTimeout = 10000; connection.readTimeout = 20000; connection.doOutput = true
      connection.setRequestProperty("Authorization", "Bearer " + session.getString("access"))
      connection.setRequestProperty("Idempotency-Key",item.getString("key"))
      connection.setRequestProperty("Content-Type",if (body != null) "application/json" else item.getString("mime"))
      connection.setFixedLengthStreamingMode(body?.size?.toLong() ?: item.getLong("size"))
      connection.outputStream.use { output ->
        if (body != null) output.write(body) else ShareStore.openFile(c,item).use { input -> input.copyTo(output) }
      }
      val status = connection.responseCode
      if (status in 200..299) {
        val response = connection.inputStream.use { input ->
          val bytes = input.readBytesBounded(2 * 1024 * 1024)
          JSONObject(String(bytes,Charsets.UTF_8))
        }
        check(response.optString("id").isNotBlank()) { "Save acknowledgment missing" }
      }
      return status
    } finally { connection.disconnect(); activeConnection = null }
  }
  private fun java.io.InputStream.readBytesBounded(limit: Int): ByteArray {
    val out = java.io.ByteArrayOutputStream(); val buffer = ByteArray(8192)
    while (true) {
      val size = read(buffer); if (size < 0) break
      check(out.size() + size <= limit); out.write(buffer,0,size)
    }
    return out.toByteArray()
  }
}

/** Android owns retry timing/network constraints, including process death and reboot. */
class ShareSyncJob : JobService() {
  @Volatile private var stopped = false
  override fun onStartJob(params: JobParameters): Boolean {
    stopped = false
    ShareSync.request(this) { retry -> if(!stopped) jobFinished(params,retry) }
    return true
  }
  override fun onStopJob(params: JobParameters): Boolean { stopped=true;ShareSync.cancel();return true }
}
