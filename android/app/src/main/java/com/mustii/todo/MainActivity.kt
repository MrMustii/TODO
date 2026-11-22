package com.mustii.todo

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // File import (<input type="file">)
    private var fileChooserCallback: ValueCallback<Array<Uri>>? = null

    // File export (AndroidBridge.saveFile)
    private var pendingSaveContent: String? = null

    private val openDocumentLauncher =
        registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
            // Always invoke the callback (null on cancel) or the chooser never opens again.
            fileChooserCallback?.onReceiveValue(uri?.let { arrayOf(it) })
            fileChooserCallback = null
        }

    private val createDocumentLauncher =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            val content = pendingSaveContent
            pendingSaveContent = null
            val uri = result.data?.data
            if (result.resultCode != Activity.RESULT_OK || uri == null || content == null) {
                return@registerForActivityResult
            }
            try {
                contentResolver.openOutputStream(uri, "wt")?.use { out ->
                    out.write(content.toByteArray(Charsets.UTF_8))
                } ?: throw IllegalStateException("Could not open output stream")
                Toast.makeText(this, "File saved", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Log.e(TAG, "Failed to save file", e)
                Toast.makeText(this, "Failed to save file: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
        )
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        val root = findViewById<View>(R.id.root)
        webView = findViewById(R.id.webview)

        // Keep content out from under the status/navigation bars, cutouts and the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
            WindowInsetsCompat.CONSUMED
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            @Suppress("DEPRECATION")
            databaseEnabled = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = false
            // Keep single-window mode (also the default): target="_blank" links
            // (e.g. goal notes) then navigate this WebView's main frame, which
            // shouldOverrideUrlLoading below hands to the external browser,
            // instead of being swallowed by an unhandled onCreateWindow.
            setSupportMultipleWindows(false)
        }

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.webViewClient = object : WebViewClientCompat() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? = assetLoader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(
                view: WebView,
                request: WebResourceRequest
            ): Boolean {
                val url = request.url
                if (!request.isForMainFrame) return false
                if (url.host == APP_HOST) return false
                if (url.host?.let { h -> IN_APP_HOST_SUFFIXES.any { h == it || h.endsWith(".$it") } } == true) {
                    return false // Firebase auth handler pages, if ever used
                }
                // Any other top-level navigation (external links, mailto:, etc.) leaves the app.
                try {
                    startActivity(Intent(Intent.ACTION_VIEW, url))
                } catch (e: ActivityNotFoundException) {
                    Log.w(TAG, "No app to handle $url")
                }
                return true
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(message: ConsoleMessage): Boolean {
                Log.d(
                    CONSOLE_TAG,
                    "[${message.messageLevel()}] ${message.message()} (${message.sourceId()}:${message.lineNumber()})"
                )
                return true
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                // Cancel any stale request so its callback is not leaked.
                fileChooserCallback?.onReceiveValue(null)
                fileChooserCallback = filePathCallback
                return try {
                    // JSON first; "*/*" as fallback since some providers report .json as octet-stream.
                    openDocumentLauncher.launch(arrayOf("application/json", "*/*"))
                    true
                } catch (e: ActivityNotFoundException) {
                    fileChooserCallback = null
                    filePathCallback.onReceiveValue(null)
                    Toast.makeText(this@MainActivity, "No file picker available", Toast.LENGTH_SHORT).show()
                    true
                }
            }
        }

        webView.addJavascriptInterface(AndroidBridge(), "AndroidBridge")

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript(BACK_JS) { result ->
                    if (result != "true") {
                        // Web app had nothing to close: minimise like a normal app.
                        moveTaskToBack(true)
                    }
                }
            }
        })

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(START_URL)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onPause() {
        webView.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        fileChooserCallback?.onReceiveValue(null)
        fileChooserCallback = null
        webView.removeJavascriptInterface("AndroidBridge")
        webView.destroy()
        super.onDestroy()
    }

    /** Exposed to JS as `window.AndroidBridge`. Methods run on a WebView background thread. */
    inner class AndroidBridge {
        @JavascriptInterface
        fun saveFile(filename: String, content: String, mimeType: String) {
            runOnUiThread {
                val type = mimeType.ifBlank { "application/octet-stream" }
                pendingSaveContent = content
                val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    setType(type)
                    putExtra(Intent.EXTRA_TITLE, filename)
                }
                try {
                    createDocumentLauncher.launch(intent)
                } catch (e: ActivityNotFoundException) {
                    pendingSaveContent = null
                    Toast.makeText(this@MainActivity, "No app available to save files", Toast.LENGTH_LONG).show()
                }
            }
        }
    }

    companion object {
        private const val TAG = "TODO"
        private const val CONSOLE_TAG = "TODO-WebView"
        private const val APP_HOST = "appassets.androidplatform.net"
        private const val START_URL = "https://$APP_HOST/assets/index.html"
        private val IN_APP_HOST_SUFFIXES = listOf("firebaseapp.com")
        private const val BACK_JS =
            "(function(){try{return !!(window.App && App.handleBackButton && App.handleBackButton());}catch(e){return false;}})()"
    }
}
