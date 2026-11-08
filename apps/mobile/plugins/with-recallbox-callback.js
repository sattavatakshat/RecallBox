const {withMainActivity,withAndroidManifest} = require('expo/config-plugins');
module.exports = function withRecallBoxCallback(config) {
  config=withAndroidManifest(config,config => {
    config.modResults.manifest.application[0].$['android:allowBackup']='false';
    return config;
  });
  return withMainActivity(config,config => {
    let code=config.modResults.contents;
    if(!code.includes('import android.content.Intent')) code=code.replace('import android.os.Build','import android.content.Intent\nimport android.os.Build');
    if(!code.includes('import expo.modules.recallboxcallback.CallbackStore')) code=code.replace('import android.os.Build','import expo.modules.recallboxcallback.CallbackStore\nimport android.os.Build');
    if(!code.includes('CallbackStore.save(this, intent?.data)')) code=code.replace('    super.onCreate(null)','    CallbackStore.save(this, intent?.data)\n    super.onCreate(null)');
    if(!code.includes('override fun onNewIntent')) code=code.replace('  override fun onCreate',`  override fun onNewIntent(intent: Intent) {
    CallbackStore.save(this, intent.data)
    setIntent(intent)
    super.onNewIntent(intent)
  }

  override fun onCreate`);
    config.modResults.contents=code;
    return config;
  });
};
