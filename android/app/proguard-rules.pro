# Keep the JavaScript bridge methods if minification is ever enabled.
-keepclassmembers class com.mustii.todo.MainActivity$AndroidBridge {
    @android.webkit.JavascriptInterface <methods>;
}
