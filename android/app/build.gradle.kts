import java.util.Properties

plugins {
    id("com.android.application")
}

// Read once at configuration time so the values can be used both for
// BuildConfig fields and for task wiring.
val useDevServer =
    providers.gradleProperty("forma.useDevServer").getOrElse("false").toBoolean()
val devServerUrl =
    providers.gradleProperty("forma.devServerUrl").getOrElse("http://localhost:8443")
val pnpmCommand = providers.gradleProperty("forma.pnpmCommand")
    .getOrElse("corepack,pnpm")
    .split(",")
    .map(String::trim)
    .filter(String::isNotEmpty)

// Release signing is opt-in: drop a keystore.properties next to this file to
// produce an installable release build. See keystore.properties.example.
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties().apply {
    if (keystorePropertiesFile.isFile) {
        keystorePropertiesFile.inputStream().use(::load)
    }
}

android {
    namespace = "com.forma.app"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.forma.app"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        buildConfigField("boolean", "USE_DEV_SERVER", useDevServer.toString())
        buildConfigField("String", "DEV_SERVER_URL", "\"$devServerUrl\"")
    }

    if (keystorePropertiesFile.isFile) {
        signingConfigs {
            create("release") {
                storeFile = rootProject.file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            if (keystorePropertiesFile.isFile) {
                signingConfig = signingConfigs.getByName("release")
            }
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.core:core:1.19.1")
    implementation("androidx.activity:activity:1.13.0")
    implementation("androidx.webkit:webkit:1.17.1")
}

/**
 * Builds the web app with Vite into ../dist. Run it directly with
 * `./gradlew webBuild`, or let the asset sync below pick the output up.
 */
val webBuild by tasks.registering(Exec::class) {
    group = "build"
    description = "Builds the Vite web app into ../dist using relative asset URLs."
    workingDir = rootProject.projectDir.parentFile
    commandLine(pnpmCommand + listOf("run", "build:android"))
}

/**
 * Copies the Vite output into the APK assets under /public, which the
 * WebViewAssetLoader in MainActivity serves from a secure https origin.
 * `Sync` drops stale hashed bundles left over from previous builds.
 */
val syncWebAssets by tasks.registering(Sync::class) {
    group = "build"
    description = "Copies ../dist into the APK assets."
    from(rootProject.layout.projectDirectory.dir("../dist")) {
        // Esto solo lo usa la PWA web. El WebView ya trae el shell dentro
        // del APK, asi que aqui solo ocuparia sitio; y un service worker
        // serviria contenido viejo tras actualizar la app. El icono del
        // lanzador sale de res/mipmap, no de aqui.
        exclude(
            "robots.txt",
            "sw.js",
            "manifest.webmanifest",
            "apple-touch-icon.png",
            "icon-*.png",
        )
    }
    into(layout.projectDirectory.dir("src/main/assets/public"))
    doFirst {
        val index = rootProject.layout.projectDirectory.file("../dist/index.html").asFile
        if (!index.isFile) {
            throw GradleException(
                "No web build found at ${index.parentFile}. " +
                    "Run `./gradlew webBuild` (or `pnpm run build:android`) first.",
            )
        }
    }
}

tasks.named("preBuild") {
    dependsOn(syncWebAssets)
}
