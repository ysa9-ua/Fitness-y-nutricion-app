# The WebView reaches the web app through @JavascriptInterface, which is
# resolved reflectively at runtime, so the bridge must survive shrinking.
-keepclassmembers class com.forma.app.WebBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.forma.app.WebBridge { *; }

# WebViewClientCompat / WebChromeClient are instantiated by us but the framework
# also consults them by name.
-keep public class * extends androidx.webkit.WebViewClientCompat
-keep public class * extends android.webkit.WebChromeClient
