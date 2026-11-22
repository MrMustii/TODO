plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// ---------------------------------------------------------------------------
// Web assets: the files at the repository root (../ relative to android/) are
// the ONLY editable copy. They are synced into a generated assets directory at
// build time, so nothing in src/main/assets can drift out of date.
// ---------------------------------------------------------------------------
val webRoot = rootProject.layout.projectDirectory.dir("..")
val generatedWebAssets = layout.buildDirectory.dir("generated/webAssets")

val syncWebAssets by tasks.registering(Sync::class) {
    description = "Copies the web app (index.html, JS, CSS, vendor/) from the repo root into generated assets."
    from(webRoot) {
        include("index.html", "app.js", "storage.js", "styles.css", "phone.css", "firebase-config.js")
        include("vendor/**")
    }
    into(generatedWebAssets)
}

android {
    namespace = "com.mustii.todo"
    compileSdk = 35
    buildToolsVersion = "35.0.0"

    defaultConfig {
        applicationId = "com.mustii.todo"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(generatedWebAssets)
        }
    }
}

// Every variant task (including merge*Assets) runs after preBuild.
tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
}
