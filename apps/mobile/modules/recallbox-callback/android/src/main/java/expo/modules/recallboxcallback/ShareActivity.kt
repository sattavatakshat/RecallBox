package expo.modules.recallboxcallback

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.accessibility.AccessibilityManager
import android.widget.ImageView
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import java.util.UUID
import java.util.concurrent.Executors

/** A compact, translucent native receiver; never starts React/Metro just to save. */
class ShareActivity : Activity() {
  private val handler = Handler(Looper.getMainLooper())
  private val io = Executors.newSingleThreadExecutor()
  private var delivery = ""
  private var revision = 0
  private var failed = false
  private var lastState = ""
  private var destroyed = false
  private var receiving = false
  private val update: () -> Unit = { handler.post { updateState() } }
  private val dismiss = Runnable { finish() }
  private val dark get() = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
  private val ink get() = getColor(R.color.recallbox_primary_text)
  private val paper get() = getColor(R.color.recallbox_sheet_surface)
  private fun dimen(id: Int) = resources.getDimensionPixelSize(id)
  override fun onCreate(state: Bundle?) {
    super.onCreate(state)
    window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    window.setLayout(WindowManager.LayoutParams.MATCH_PARENT,WindowManager.LayoutParams.MATCH_PARENT)
    delivery = state?.getString("delivery") ?: UUID.randomUUID().toString()
    ShareStore.listeners.add(update)
    receive()
  }
  override fun onSaveInstanceState(outState: Bundle) { outState.putString("delivery",delivery); super.onSaveInstanceState(outState) }
  override fun onNewIntent(value: Intent) {
    super.onNewIntent(value); setIntent(value)
    delivery = UUID.randomUUID().toString(); revision++; receive()
  }
  private fun receive() {
    handler.removeCallbacks(dismiss); failed = false; receiving = true; lastState = ""
    show("saving","Saving to RecallBox","Keeping your item…")
    val incoming = intent; val id = delivery; val version = revision
    io.execute {
      try {
        ShareStore.receive(applicationContext,incoming,id)
      } catch (e: Exception) {
        handler.post { if (!destroyed && revision == version) {
          receiving = false; failed = true
          show("failed","Couldn't save","Your item hasn't been saved.",
            if(e is IllegalArgumentException) e.message?.take(140) ?: "Invalid share. Retry or cancel."
            else "Device storage or file access is unavailable. Retry or cancel.")
        } }
        return@execute
      }
      val scheduled = ShareSync.schedule(applicationContext)
      android.util.Log.i("RecallBoxShare",if (scheduled) "Encrypted share queued; retry scheduled" else "Encrypted share queued; manual retry available")
      ShareSync.request(applicationContext)
      handler.postDelayed({ if (!destroyed && revision == version) {receiving=false;updateState()} },1000)
    }
  }
  private fun updateState() {
    if (destroyed || failed || receiving) return
    val id = delivery; val version = revision
    io.execute {
      try {
        val rows = ShareStore.delivery(applicationContext,id)
        val saved = rows.isNotEmpty() && rows.all { it.optString("status") == "saved" }
        val session = ShareStore.session(applicationContext)
        val login = session == null || session.optLong("expires") <= System.currentTimeMillis() + 30000
        val blocked = rows.any { it.optBoolean("blocked") }
        handler.post { if (!destroyed && revision == version) {
          when {
            rows.isEmpty() -> show("failed","Couldn't save","Your item hasn't been saved.","Try again or cancel.")
            saved -> show("saved","Saved to RecallBox","You're all set. Keep browsing.")
            login -> show("login","Saved on this device","We'll sync when you're connected.","Sign in to RecallBox to finish syncing.")
            blocked -> show("blocked","Saved on this device","Your encrypted item is waiting.","Open RecallBox to review the save or retry.")
            else -> show("queued","Saved on this device","We'll sync when you're connected.")
          }
        } }
      } catch (_: Exception) { handler.post { if (!destroyed && revision == version) show("failed","Couldn't save","Your item hasn't been saved.","Device storage could not be verified. Retry or cancel.") } }
    }
  }
  private fun show(state: String, title: String, subtitle: String, detail: String = "") {
    if (destroyed || lastState == state) return
    lastState = state; handler.removeCallbacks(dismiss)
    val root = LinearLayout(this).apply {
      orientation=LinearLayout.VERTICAL; gravity=Gravity.BOTTOM
      setPadding(dimen(R.dimen.recallbox_space_compact),0,dimen(R.dimen.recallbox_space_compact),dimen(R.dimen.recallbox_space_compact)); setBackgroundColor(Color.TRANSPARENT)
      fitsSystemWindows=true
    }
    root.setOnApplyWindowInsetsListener { view, insets ->
      if (Build.VERSION.SDK_INT >= 30) {
        val bars = insets.getInsets(android.view.WindowInsets.Type.systemBars())
        view.setPadding(bars.left+dimen(R.dimen.recallbox_space_compact),bars.top+dimen(R.dimen.recallbox_space_compact),bars.right+dimen(R.dimen.recallbox_space_compact),bars.bottom+dimen(R.dimen.recallbox_space_compact))
      } else {
        @Suppress("DEPRECATION")
        view.setPadding(insets.systemWindowInsetLeft+dimen(R.dimen.recallbox_space_compact),insets.systemWindowInsetTop+dimen(R.dimen.recallbox_space_compact),
          insets.systemWindowInsetRight+dimen(R.dimen.recallbox_space_compact),insets.systemWindowInsetBottom+dimen(R.dimen.recallbox_space_compact))
      }
      insets
    }
    if (Build.VERSION.SDK_INT >= 30) {
      val lightBars = android.view.WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or
        android.view.WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
      window.insetsController?.setSystemBarsAppearance(if(dark) 0 else lightBars, lightBars)
    } else {
      @Suppress("DEPRECATION")
      val lightNavigation = if(Build.VERSION.SDK_INT >= 26) View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR else 0
      @Suppress("DEPRECATION")
      window.decorView.systemUiVisibility = if(dark) 0 else View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or lightNavigation
    }
    val card = LinearLayout(this).apply {
      orientation=LinearLayout.VERTICAL; setPadding(dimen(R.dimen.recallbox_space_large),dimen(R.dimen.recallbox_space_compact),dimen(R.dimen.recallbox_space_large),dimen(R.dimen.recallbox_space_large)); elevation=resources.getDimension(R.dimen.recallbox_elevation_sheet)
      background=GradientDrawable().apply { setColor(paper); cornerRadius=dimen(R.dimen.recallbox_radius_large).toFloat() }
    }
    val handle = View(this).apply { background=GradientDrawable().apply {setColor(getColor(R.color.recallbox_muted_text));cornerRadius=dimen(R.dimen.recallbox_radius_tiny).toFloat()} }
    card.addView(handle,LinearLayout.LayoutParams(dimen(R.dimen.recallbox_sheet_handle_width),dimen(R.dimen.recallbox_sheet_handle_height)).apply {gravity=Gravity.CENTER_HORIZONTAL;bottomMargin=dimen(R.dimen.recallbox_space_large)})
    val row = LinearLayout(this).apply { orientation=LinearLayout.HORIZONTAL; gravity=Gravity.CENTER_VERTICAL }
    // Same Lucide geometry as React, generated without starting React/Metro.
    val symbol = ImageView(this).apply {
      val icon = when(state) {
        "saved" -> R.drawable.recallbox_icon_check
        "failed" -> R.drawable.recallbox_icon_triangle_alert
        "saving" -> R.drawable.recallbox_icon_clock
        else -> R.drawable.recallbox_icon_upload
      }
      setImageDrawable(getDrawable(icon)?.mutate()?.apply {
        setTint(getColor(if(state=="failed") R.color.recallbox_error else R.color.recallbox_on_highlight))
      })
      setPadding(dimen(R.dimen.recallbox_space_compact),dimen(R.dimen.recallbox_space_compact),
        dimen(R.dimen.recallbox_space_compact),dimen(R.dimen.recallbox_space_compact))
      background=GradientDrawable().apply {
        setColor(getColor(if(state=="failed") R.color.recallbox_error_surface else R.color.recallbox_highlight))
        shape=GradientDrawable.OVAL
      }
      importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO
    }
    row.addView(symbol,LinearLayout.LayoutParams(dimen(R.dimen.recallbox_touch),dimen(R.dimen.recallbox_touch)).apply {rightMargin=dimen(R.dimen.recallbox_space_medium)})
    val copy = LinearLayout(this).apply {orientation=LinearLayout.VERTICAL}
    val heading=TextView(this).apply {text=title;setTextSize(TypedValue.COMPLEX_UNIT_PX,resources.getDimension(R.dimen.recallbox_type_native_heading));setTextColor(ink)
      typeface=try {Typeface.createFromAsset(assets,"DMSerifDisplay-Regular.ttf")}
        catch (_: Exception) {Typeface.create("serif",Typeface.BOLD)}}
    copy.addView(heading)
    copy.addView(TextView(this).apply {text=subtitle;setTextSize(TypedValue.COMPLEX_UNIT_PX,resources.getDimension(R.dimen.recallbox_type_secondary));setTextColor(ink);setPadding(0,dimen(R.dimen.recallbox_space_tiny),0,0)})
    row.addView(copy,LinearLayout.LayoutParams(0,LinearLayout.LayoutParams.WRAP_CONTENT,1f));card.addView(row)
    if(detail.isNotBlank()) card.addView(TextView(this).apply {text=detail;setTextSize(TypedValue.COMPLEX_UNIT_PX,resources.getDimension(R.dimen.recallbox_type_secondary));setTextColor(ink);setPadding(0,dimen(R.dimen.recallbox_space_medium),0,dimen(R.dimen.recallbox_space_small))})
    if(state=="failed") {
      addButton(card,"Retry") { receive() }
      addButton(card,"Cancel") { finish() }
    } else if(state=="login" || state=="blocked") {
      addButton(card,if(state=="login") "Sign in to sync" else "Open RecallBox") {
        packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }
        finish()
      }
      addButton(card,"Close") {finish()}
    }
    val scroll=ScrollView(this).apply {isFillViewport=false;addView(card)}
    root.addView(scroll,LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.WRAP_CONTENT))
    setContentView(root)
    heading.accessibilityLiveRegion=View.ACCESSIBILITY_LIVE_REGION_POLITE
    if(state in listOf("saved","queued")) {
      val a11y=getSystemService(AccessibilityManager::class.java)
      val timeout=if(Build.VERSION.SDK_INT>=29) a11y.getRecommendedTimeoutMillis(3000,
        AccessibilityManager.FLAG_CONTENT_TEXT or AccessibilityManager.FLAG_CONTENT_ICONS)
        else if(a11y.isTouchExplorationEnabled) 10000 else 3000
      handler.postDelayed(dismiss,timeout.toLong())
    }
  }
  private fun addButton(parent: LinearLayout, label: String, action: ()->Unit) {
    parent.addView(Button(this).apply {text=label;isAllCaps=false;minHeight=dimen(R.dimen.recallbox_touch)
      setTextSize(TypedValue.COMPLEX_UNIT_PX,resources.getDimension(R.dimen.recallbox_type_button))
      backgroundTintList=android.content.res.ColorStateList.valueOf(getColor(R.color.recallbox_accent))
      setTextColor(getColor(R.color.recallbox_on_accent))
      setOnClickListener {action()}},
      LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT,LinearLayout.LayoutParams.WRAP_CONTENT).apply {topMargin=dimen(R.dimen.recallbox_space_small)})
  }
  @Deprecated("Deprecated in Java") override fun onBackPressed() {
    if(receiving) return // Finish copying granted streams before permitting dismissal.
    finish() // A locally queued item remains queued; Back does not discard it.
  }
  override fun onDestroy() {
    destroyed=true;ShareStore.listeners.remove(update);handler.removeCallbacksAndMessages(null);io.shutdown();super.onDestroy()
  }
}
