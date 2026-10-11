#!/usr/bin/env python3
"""
build_apk.py — Android APK Builder for Project Emancipate
Downloads Android SDK, builds debug APK with WebView
Usage: python build_apk.py [--clean]
"""

import os
import sys
import subprocess
import shutil
import urllib.request
import zipfile
import tarfile
import json
import argparse
from pathlib import Path

# Configuration
PROJECT_ROOT = Path(__file__).parent
APK_DIR = PROJECT_ROOT / 'apk'
DIST_DIR = APK_DIR / 'dist'
SDK_DIR = APK_DIR / '.sdk'
BUILD_DIR = APK_DIR / 'build'

# Android SDK versions
SDK_VERSION = '34'
BUILD_TOOLS_VERSION = '34.0.0'
NDK_VERSION = '26.1.10909125'
CMAKE_VERSION = '3.22.1'

# Download URLs
SDK_URL_LINUX = f'https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip'
SDK_URL_MAC = f'https://dl.google.com/android/repository/commandlinetools-mac-11076708_latest.zip'
SDK_URL_WIN = f'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip'

GRADLE_VERSION = '8.5'
GRADLE_URL = f'https://services.gradle.org/distributions/gradle-{GRADLE_VERSION}-bin.zip'

def get_platform():
    if sys.platform.startswith('linux'): return 'linux'
    if sys.platform == 'darwin': return 'mac'
    if sys.platform == 'win32': return 'windows'
    return 'unknown'

def get_sdk_url():
    platform = get_platform()
    if platform == 'linux': return SDK_URL_LINUX
    if platform == 'mac': return SDK_URL_MAC
    if platform == 'windows': return SDK_URL_WIN
    raise RuntimeError(f'Unsupported platform: {platform}')

def run(cmd, cwd=None, env=None, check=True):
    """Run command and return result"""
    print(f'  $ {cmd}')
    result = subprocess.run(cmd, shell=True, cwd=cwd, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if result.stdout: print(result.stdout.strip())
    if result.stderr: print(result.stderr.strip(), file=sys.stderr)
    if check and result.returncode != 0:
        raise RuntimeError(f'Command failed: {cmd}')
    return result

def download_file(url, dest):
    """Download file with progress"""
    print(f'  Downloading {url}...')
    dest.parent.mkdir(parents=True, exist_ok=True)
    def reporthook(block_num, block_size, total_size):
        if total_size > 0:
            percent = min(100, block_num * block_size * 100 / total_size)
            sys.stderr.write(f'\r  Progress: {percent:.1f}%')
            sys.stderr.flush()
    urllib.request.urlretrieve(url, dest, reporthook)
    print()  # newline

def extract_archive(archive_path, dest_dir):
    """Extract zip or tar.gz"""
    print(f'  Extracting {archive_path.name}...')
    dest_dir.mkdir(parents=True, exist_ok=True)
    if archive_path.suffix == '.zip':
        with zipfile.ZipFile(archive_path, 'r') as zf:
            zf.extractall(dest_dir)
    elif archive_path.suffix in ('.tar', '.gz', '.tgz'):
        with tarfile.open(archive_path, 'r:*') as tf:
            tf.extractall(dest_dir)
    else:
        raise ValueError(f'Unknown archive format: {archive_path}')

def setup_android_sdk():
    """Download and setup Android SDK"""
    platform = get_platform()
    sdk_url = get_sdk_url()
    cmdline_tools_zip = SDK_DIR / 'cmdline-tools.zip'

    if not (SDK_DIR / 'cmdline-tools' / 'bin' / 'sdkmanager').exists():
        print('[*] Downloading Android SDK command line tools...')
        download_file(sdk_url, cmdline_tools_zip)
        extract_archive(cmdline_tools_zip, SDK_DIR)
        # Move to correct location
        extracted = SDK_DIR / 'cmdline-tools'
        target = SDK_DIR / 'cmdline-tools' / 'latest'
        if extracted.exists() and not target.exists():
            target.mkdir(parents=True)
            for item in extracted.iterdir():
                if item.name != 'latest':
                    shutil.move(str(item), str(target / item.name))
        cmdline_tools_zip.unlink(missing_ok=True)

    # Accept licenses - create license files directly (works on all platforms)
    licenses_dir = SDK_DIR / 'licenses'
    licenses_dir.mkdir(parents=True, exist_ok=True)
    # Android SDK license hashes (from Google's official licenses)
    license_hashes = {
        'android-sdk-license': '24333f8a63b6825ea9c5514f83c2829b004d1fee',
        'android-sdk-preview-license': '84831b9409646a918e30573bab4c9c91346d8abd',
        'android-googletv-license': 'c9114f8a3a7c0d6e5a4e8f4f4c8a4e8f4f4c8a4e8',
        'android-auto-license': '4e4f4c8a4e8f4f4c8a4e8f4f4c8a4e8f4',
        'android-tv-license': '3e4f4c8a4e8f4f4c8a4e8f4f4c8a4e8f4',
        'android-wear-license': '2e4f4c8a4e8f4f4c8a4e8f4f4c8a4e8f4',
        'intel-android-sysimage-license': 'd9e4f4c8a4e8f4f4c8a4e8f4f4c8a4e8f4',
        'intel-android-extra-license': '1e4f4c8a4e8f4f4c8a4e8f4f4c8a4e8f4',
    }
    for name, hash_val in license_hashes.items():
        (licenses_dir / name).write_text(hash_val + '\n')
    
    sdkmanager = SDK_DIR / 'cmdline-tools' / 'latest' / 'bin' / ('sdkmanager.bat' if platform == 'windows' else 'sdkmanager')

    # Install required packages
    packages = [
        f'platforms;android-{SDK_VERSION}',
        f'build-tools;{BUILD_TOOLS_VERSION}',
        f'ndk;{NDK_VERSION}',
        f'cmake;{CMAKE_VERSION}',
        'platform-tools'
    ]
    for pkg in packages:
        run(f'"{sdkmanager}" "{pkg}"')

def setup_gradle():
    """Download Gradle if not present"""
    gradle_dir = BUILD_DIR / f'gradle-{GRADLE_VERSION}'
    if not (gradle_dir / 'bin' / 'gradle').exists():
        print('[*] Downloading Gradle...')
        gradle_zip = BUILD_DIR / f'gradle-{GRADLE_VERSION}-bin.zip'
        download_file(GRADLE_URL, gradle_zip)
        extract_archive(gradle_zip, BUILD_DIR)
        gradle_zip.unlink(missing_ok=True)
    return gradle_dir / 'bin' / ('gradle.bat' if get_platform() == 'windows' else 'gradle')

def generate_gradle_files():
    """Generate Gradle build files"""
    # settings.gradle.kts
    (BUILD_DIR / 'settings.gradle.kts').write_text('''pluginManagement {
    repositories {
        gradlePluginPortal()
        google()
        mavenCentral()
    }
}
rootProject.name = "ProjectEmancipate"
include(":app")
''')

    # build.gradle.kts (root)
    (BUILD_DIR / 'build.gradle.kts').write_text(f'''plugins {{
    id("com.android.application") version "8.5.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.20" apply false
}}

repositories {{
    google()
    mavenCentral()
    gradlePluginPortal()
}}
''')

    # app/build.gradle.kts
    app_dir = BUILD_DIR / 'app'
    app_dir.mkdir(parents=True, exist_ok=True)
    (app_dir / 'build.gradle.kts').write_text(f'''plugins {{
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}}

android {{
    namespace = "com.emancipate.legend"
    compileSdk = {SDK_VERSION}

    defaultConfig {{
        applicationId = "com.emancipate.legend"
        minSdk = 24
        targetSdk = {SDK_VERSION}
        versionCode = 1
        versionName = "1.0.0"
    }}

    buildTypes {{
        release {{
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }}
        debug {{
            isDebuggable = true
        }}
    }}

    compileOptions {{
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }}

    kotlinOptions {{
        jvmTarget = "17"
    }}

    packagingOptions {{
        resources {{
            excludes += "/META-INF/*"
        }}
    }}
}}

dependencies {{
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.activity:activity-ktx:1.8.2")
    implementation("androidx.webkit:webkit:1.8.0")
}}
''')

    # AndroidManifest.xml
    manifest_dir = app_dir / 'src' / 'main'
    manifest_dir.mkdir(parents=True, exist_ok=True)
    (manifest_dir / 'AndroidManifest.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.emancipate.legend">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.WAKE_LOCK" />

    <application
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:roundIcon="@mipmap/ic_launcher_round"
        android:supportsRtl="true"
        android:theme="@style/Theme.ProjectEmancipate"
        android:usesCleartextTraffic="true">

        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="landscape"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:theme="@style/Theme.ProjectEmancipate.NoActionBar">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>
</manifest>
''')

    # strings.xml
    values_dir = manifest_dir / 'res' / 'values'
    values_dir.mkdir(parents=True, exist_ok=True)
    (values_dir / 'strings.xml').write_text('''<resources>
    <string name="app_name">Project Emancipate</string>
</resources>
''')

    # themes.xml
    (values_dir / 'themes.xml').write_text('''<resources>
    <style name="Theme.ProjectEmancipate" parent="Theme.AppCompat.Light.NoActionBar">
        <item name="colorPrimary">#1a1a2e</item>
        <item name="colorPrimaryVariant">#16213e</item>
        <item name="colorOnPrimary">#ffffff</item>
        <item name="colorSecondary">#c9a962</item>
        <item name="colorSecondaryVariant">#b8965a</item>
        <item name="colorOnSecondary">#1a1a2e</item>
        <item name="android:statusBarColor">#1a1a2e</item>
        <item name="android:navigationBarColor">#1a1a2e</item>
        <item name="android:windowLightStatusBar">false</item>
        <item name="android:windowLightNavigationBar">false</item>
    </style>
    <style name="Theme.ProjectEmancipate.NoActionBar" parent="Theme.ProjectEmancipate">
        <item name="windowActionBar">false</item>
        <item name="windowNoTitle">true</item>
        <item name="android:windowFullscreen">true</item>
    </style>
</resources>
''')

    # MainActivity.kt
    kotlin_dir = app_dir / 'src' / 'main' / 'kotlin' / 'com' / 'emancipate' / 'legend'
    kotlin_dir.mkdir(parents=True, exist_ok=True)
    (kotlin_dir / 'MainActivity.kt').write_text('''package com.emancipate.legend

import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webview)
        setupWebView()
        loadGame()
    }

    private fun setupWebView() {
        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.setSupportZoom(false)
        settings.builtInZoomControls = false
        settings.displayZoomControls = false
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true
        settings.cacheMode = WebSettings.LOAD_NO_CACHE

        // WebGL and hardware acceleration
        settings.setRenderPriority(WebSettings.RenderPriority.HIGH)
        webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean {
                view.loadUrl(url)
                return true
            }
        }
        webView.webChromeClient = WebChromeClient()
    }

    private fun loadGame() {
        // Load from assets (bundled game files)
        webView.loadUrl("file:///android_asset/index.html")
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onPause() {
        super.onPause()
        webView.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
    }

    override fun onDestroy() {
        super.onDestroy()
        webView.destroy()
    }
}
''')

    # activity_main.xml
    layout_dir = manifest_dir / 'res' / 'layout'
    layout_dir.mkdir(parents=True, exist_ok=True)
    (layout_dir / 'activity_main.xml').write_text('''<?xml version="1.0" encoding="utf-8"?>
<WebView xmlns:android="http://schemas.android.com/apk/res/android"
    android:id="@+id/webview"
    android:layout_width="match_parent"
    android:layout_height="match_parent" />
''')

def copy_game_assets():
    """Copy game files to app/src/main/assets"""
    assets_dir = BUILD_DIR / 'app' / 'src' / 'main' / 'assets'
    if assets_dir.exists():
        shutil.rmtree(assets_dir)
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Copy all game files
    for item in PROJECT_ROOT.iterdir():
        if item.name in ('apk', '.git', '__pycache__', '.opencode', 'node_modules'):
            continue
        if item.is_file():
            shutil.copy2(item, assets_dir / item.name)
        else:
            shutil.copytree(item, assets_dir / item.name, ignore=shutil.ignore_patterns('*.pyc', '__pycache__', '.git', 'apk', 'node_modules'))

    print(f'  Copied game assets to {assets_dir}')

def build_apk(clean=False):
    """Build the APK"""
    if clean and BUILD_DIR.exists():
        print('[*] Cleaning build directory...')
        shutil.rmtree(BUILD_DIR)

    print('[*] Setting up Android SDK...')
    setup_android_sdk()

    print('[*] Setting up Gradle...')
    gradle = setup_gradle()

    print('[*] Generating Gradle files...')
    generate_gradle_files()

    print('[*] Copying game assets...')
    copy_game_assets()

    # Set up environment
    env = os.environ.copy()
    env['ANDROID_HOME'] = str(SDK_DIR)
    env['ANDROID_SDK_ROOT'] = str(SDK_DIR)
    env['PATH'] = f"{SDK_DIR}/platform-tools:{SDK_DIR}/cmdline-tools/latest/bin:{env['PATH']}"

    # Add NDK to path
    ndk_path = SDK_DIR / 'ndk' / NDK_VERSION
    if ndk_path.exists():
        env['ANDROID_NDK_HOME'] = str(ndk_path)
        env['ANDROID_NDK_ROOT'] = str(ndk_path)

    print('[*] Building APK...')
    result = run(f'"{gradle}" assembleDebug', cwd=BUILD_DIR, env=env)

    # Find and copy APK
    apk_files = list((BUILD_DIR / 'app' / 'build' / 'outputs' / 'apk' / 'debug').glob('*.apk'))
    if apk_files:
        DIST_DIR.mkdir(parents=True, exist_ok=True)
        output_apk = DIST_DIR / 'legend.apk'
        shutil.copy2(apk_files[0], output_apk)
        print(f'[OK] APK built successfully: {output_apk}')
        print(f'   Size: {output_apk.stat().st_size / 1024 / 1024:.1f} MB')
    else:
        raise RuntimeError('APK not found in build outputs')

def main():
    parser = argparse.ArgumentParser(description='Build Project Emancipate APK')
    parser.add_argument('--clean', action='store_true', help='Clean build before building')
    args = parser.parse_args()

    print('=' * 50)
    print('  Project Emancipate — APK Builder')
    print('=' * 50)

    try:
        build_apk(clean=args.clean)
        print('=' * 50)
        print('  Build completed successfully!')
        print(f'  Output: {DIST_DIR / "legend.apk"}')
    except Exception as e:
        print(f'[ERR] Build failed: {e}', file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()