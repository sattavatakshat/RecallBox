const {withMainActivity, withAndroidManifest} = require('expo/config-plugins');

/** Install a text/plain share target without altering Auth0 VIEW callbacks. */
module.exports = function withRecallBoxCallback(config) {
  config = withAndroidManifest(config, c => {
    const application = c.modResults.manifest.application[0];
    application.$['android:allowBackup'] = 'false';
    const activity = application.activity?.find(a => a.$['android:name'] === '.MainActivity')
      || application.activity?.[0];
    if (!activity) throw new Error('RecallBox MainActivity missing during Android prebuild');
    activity['intent-filter'] ||= [];
    const hasShare = activity['intent-filter'].some(f =>
      f.action?.some(a => a.$['android:name'] === 'android.intent.action.SEND')
      && f.data?.some(d => d.$['android:mimeType'] === 'text/plain'));
    if (!hasShare) {
      activity['intent-filter'].push({
        action: [{$: {'android:name': 'android.intent.action.SEND'}}],
        category: [{$: {'android:name': 'android.intent.category.DEFAULT'}}],
        data: [{$: {'android:mimeType': 'text/plain'}}],
      });
    }
    return c;
  });
  return withMainActivity(config, c => {
    let code = c.modResults.contents;
    function addImport(qualified) {
      const line = 'import ' + qualified;
      if (code.includes(line)) return;
      if (!code.includes('import android.os.Build')) throw new Error('MainActivity import anchor missing');
      code = code.replace('import android.os.Build', line + '\nimport android.os.Build');
    }
    addImport('android.content.Intent');
    addImport('expo.modules.recallboxcallback.CallbackStore');
    addImport('expo.modules.recallboxcallback.ShareStore');
    const createAnchor = '    super.onCreate(null)';
    if (!code.includes(createAnchor)) throw new Error('MainActivity onCreate anchor missing');
    if (!code.includes('CallbackStore.save(this, intent?.data)')) {
      code = code.replace(createAnchor, '    CallbackStore.save(this, intent?.data)\n' + createAnchor);
    }
    if (!code.includes('ShareStore.save(this, intent)\n    super.onCreate(null)')) {
      code = code.replace(createAnchor, '    ShareStore.save(this, intent)\n' + createAnchor);
    }
    if (!code.includes('override fun onNewIntent(intent: Intent)')) {
      code = code.replace('  override fun onCreate', `  override fun onNewIntent(intent: Intent) {
    CallbackStore.save(this, intent.data)
    ShareStore.save(this, intent)
    setIntent(intent)
    super.onNewIntent(intent)
  }

  override fun onCreate`);
    } else if (!code.includes('ShareStore.save(this, intent)\n    setIntent(intent)')) {
      code = code.replace('    setIntent(intent)', '    ShareStore.save(this, intent)\n    setIntent(intent)');
    }
    c.modResults.contents = code;
    return c;
  });
};
