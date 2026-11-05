package com.pixelvault.mobile.ui

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import com.pixelvault.mobile.api.Api
import kotlinx.coroutines.launch

private fun extractToken(raw: String): String? =
    try { Uri.parse(raw).getQueryParameter("token") } catch (_: Exception) { null }

@androidx.annotation.OptIn(ExperimentalGetImage::class)
private class QrAnalyzer(private val onRaw: (String) -> Unit) : ImageAnalysis.Analyzer {
    private val scanner: BarcodeScanner = BarcodeScanning.getClient()

    override fun analyze(imageProxy: ImageProxy) {
        val media = imageProxy.image
        if (media == null) {
            imageProxy.close()
            return
        }
        val input = InputImage.fromMediaImage(media, imageProxy.imageInfo.rotationDegrees)
        scanner.process(input)
            .addOnSuccessListener { barcodes ->
                for (barcode in barcodes) {
                    val raw = barcode.rawValue ?: continue
                    if (raw.startsWith("pixelvault://qrlogin")) { onRaw(raw); break }
                }
            }
            .addOnCompleteListener { imageProxy.close() }
    }
}

@Composable
fun QrScanScreen(onBack: () -> Unit) {
    var hasCamera by remember { mutableStateOf(false) }
    var message by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCamera = granted
    }

    LaunchedEffect(Unit) {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            hasCamera = true
        } else {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Column(Modifier.fillMaxSize()) {
        TextButton(onClick = onBack) { Text("Back") }
        Text("Scan the web login QR code", style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(horizontal = 16.dp))
        if (hasCamera) {
            AndroidView(
                factory = { ctx ->
                    val previewView = PreviewView(ctx)
                    val providerFuture = ProcessCameraProvider.getInstance(ctx)
                    providerFuture.addListener({
                        try {
                            val provider = providerFuture.get()
                            val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
                            val analysis = ImageAnalysis.Builder()
                                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                .build()
                            analysis.setAnalyzer(ContextCompat.getMainExecutor(ctx), QrAnalyzer { raw ->
                                if (!busy) {
                                    busy = true
                                    val token = extractToken(raw)
                                    if (token == null) {
                                        message = "Not a PixelVault login code"
                                        busy = false
                                    } else {
                                        scope.launch {
                                            runCatching { Api.api.qrConfirm(mapOf("token" to token)) }
                                                .onSuccess { message = "Signed in on the web" }
                                                .onFailure { message = it.message ?: "Could not confirm login" }
                                            busy = false
                                        }
                                    }
                                }
                            })
                            provider.unbindAll()
                            provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                        } catch (_: Exception) {}
                    }, ContextCompat.getMainExecutor(ctx))
                    previewView
                },
                modifier = Modifier.fillMaxWidth().weight(1f)
            )
        } else {
            Text("Camera permission is required.", Modifier.padding(16.dp))
        }
        if (message != null) {
            Text(message!!, color = MaterialTheme.colorScheme.primary, modifier = Modifier.padding(16.dp))
        }
    }
}
