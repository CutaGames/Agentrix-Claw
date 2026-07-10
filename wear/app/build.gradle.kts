plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

android {
    namespace = "app.agentrix.wear"
    compileSdk = 34

    defaultConfig {
        applicationId = "app.agentrix.wear"
        minSdk = 30            // Wear OS 4 (round, modern APIs)
        targetSdk = 34
        versionCode = 1
        versionName = "0.1.0"

        // Size: single ABI for watches.
        ndk { abiFilters += "arm64-v8a" }

        // Backend base URL (override per flavor/CI if needed).
        buildConfigField("String", "API_BASE", "\"https://api.agentrix.top/api\"")
    }

    // Release signing — reuses the SAME keystore secrets as the phone APK CI
    // (MYAPP_UPLOAD_* gradle properties injected by build-wear.yml). When absent
    // (local dev), release falls back to the debug signing config so it still assembles.
    signingConfigs {
        create("release") {
            if (project.hasProperty("MYAPP_UPLOAD_STORE_FILE")) {
                storeFile = file(project.property("MYAPP_UPLOAD_STORE_FILE") as String)
                storePassword = project.property("MYAPP_UPLOAD_STORE_PASSWORD") as String
                keyAlias = project.property("MYAPP_UPLOAD_KEY_ALIAS") as String
                keyPassword = project.property("MYAPP_UPLOAD_KEY_PASSWORD") as String
            }
        }
    }

    buildTypes {
        release {
            // Size target <30MB (硬上限) / <15MB (目标): R8 + resource shrink.
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            signingConfig = if (project.hasProperty("MYAPP_UPLOAD_STORE_FILE")) {
                signingConfigs.getByName("release")
            } else {
                signingConfigs.getByName("debug")
            }
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }
    kotlinOptions { jvmTarget = "17" }

    lint {
        abortOnError = false
        checkReleaseBuilds = false
    }

    packaging {
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "META-INF/*.version",
            "kotlin/**",
            "**/*.kotlin_metadata",
        )
    }
}

dependencies {
    // Compose (Wear) — keep the dependency surface minimal for size.
    val composeBom = platform("androidx.compose:compose-bom:2024.09.02")
    implementation(composeBom)
    implementation("androidx.compose.runtime:runtime")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.wear.compose:compose-material:1.4.0")
    implementation("androidx.wear.compose:compose-foundation:1.4.0")
    implementation("androidx.activity:activity-compose:1.9.2")
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.6")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.6")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.6")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.8.1")

    // Wear surfaces
    implementation("androidx.wear.tiles:tiles:1.4.0")
    implementation("androidx.wear.protolayout:protolayout:1.2.0")
    implementation("androidx.wear.protolayout:protolayout-material:1.2.0")
    implementation("androidx.wear.protolayout:protolayout-expression:1.2.0")
    implementation("androidx.wear.watchface:watchface-complications-data-source-ktx:1.2.1")
    implementation("com.google.guava:guava:33.2.1-android")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-guava:1.8.1")

    // Health Services (real sensors — replaces the RN Math.random simulation)
    implementation("androidx.health:health-services-client:1.1.0-alpha03")

    // Phone <-> Watch Data Layer (reuses the same message paths as AgentrixWearDataLayer)
    implementation("com.google.android.gms:play-services-wearable:18.2.0")

    // Networking + JSON — Ktor CIO is lightweight; kotlinx-serialization for small footprint.
    implementation("io.ktor:ktor-client-core:2.3.12")
    implementation("io.ktor:ktor-client-okhttp:2.3.12")
    implementation("io.ktor:ktor-client-content-negotiation:2.3.12")
    implementation("io.ktor:ktor-serialization-kotlinx-json:2.3.12")

    // Encrypted token storage
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.0.4")

    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.8.1")
}
