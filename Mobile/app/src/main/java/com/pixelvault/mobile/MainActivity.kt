package com.pixelvault.mobile

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.ui.graphics.Color
import com.pixelvault.mobile.api.Api
import com.pixelvault.mobile.ui.App

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Api.init(applicationContext)
        setContent {
            MaterialTheme(
                colorScheme = darkColorScheme(
                    primary = Color(0xFFE0A030),
                    onPrimary = Color(0xFF0B0B0C),
                    background = Color(0xFF0B0B0C),
                    onBackground = Color(0xFFE8E2D4),
                    surface = Color(0xFF15151A),
                    onSurface = Color(0xFFE8E2D4)
                )
            ) {
                App()
            }
        }
    }
}
