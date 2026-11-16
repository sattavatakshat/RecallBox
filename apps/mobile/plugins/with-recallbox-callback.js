const {withMainActivity, withAndroidManifest} = require('expo/config-plugins');

/** Incoming shares live in the native module's manifest/ShareActivity, not React's task. */
module.exports = function withRecallBoxCallback(config) {
  config = withAndroidManifest(config, c => {
    const application = c.modResults.manifest.application[0];
    application.$['android:allowBackup'] = 'false';
    const activity = application.activity?.find(a => a.$['android:name'] === '.MainActivity');
    if (!activity) throw new Error('RecallBox MainActivity missing during Android prebuild');
    // Remove an older plugin's receiver so the OS lists exactly one RecallBox target.
    activity['intent-filter'] = (activity['intent-filter'] || []).filter(filter =>
      !filter.action?.some(action => ['android.intent.action.SEND', 'android.intent.action.SEND_MULTIPLE']
        .includes(action.$['android:name'])));
    return c;
  });
  return withMainActivity(config, c => {
    let code = c.modResults.contents;
    const addImport = qualified => {
      if (code.includes('import ' + qualified)) return;
      if (!code.includes('import android.os.Build')) throw new Error('MainActivity import anchor missing');
      code = code.replace('import android.os.Build', 'import ' + qualified + '\nimport android.os.Build');
    };
    addImport('android.content.Intent');
    addImport('expo.modules.recallboxcallback.CallbackStore');
    code = code.replace(/^import expo\.modules\.recallboxcallback\.ShareStore\n/gm, '')
      .replace(/^\s*ShareStore\.save\(this, intent\)\n/gm, '');
    const anchor = '    super.onCreate(null)';
    if (!code.includes(anchor)) throw new Error('MainActivity onCreate anchor missing');
    if (!code.includes('CallbackStore.save(this, intent?.data)'))
      code = code.replace(anchor, '    CallbackStore.save(this, intent?.data)\n' + anchor);
    if (!code.includes('override fun onNewIntent(intent: Intent)')) code = code.replace('  override fun onCreate', `  override fun onNewIntent(intent: Intent) {
    CallbackStore.save(this, intent.data)
    setIntent(intent)
    super.onNewIntent(intent)
  }

  override fun onCreate`);
    c.modResults.contents = code;
    return c;
  });
};
