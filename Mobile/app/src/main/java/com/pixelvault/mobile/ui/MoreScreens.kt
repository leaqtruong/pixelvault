package com.pixelvault.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pixelvault.mobile.api.Api
import com.pixelvault.mobile.model.*
import kotlinx.coroutines.launch
import java.util.Locale

private fun money(v: Double): String = "$" + String.format(Locale.US, "%.2f", v)

@Composable
fun ToysScreen(onOpen: (String) -> Unit, onBack: () -> Unit) {
    var data by remember { mutableStateOf<ToysResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        runCatching { Api.api.toys() }.onSuccess { data = it }.onFailure { error = it.message }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        TextButton(onClick = onBack) { Text("Back") }
        Text("Collectibles", style = MaterialTheme.typography.headlineSmall)
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
            items(data?.toys ?: emptyList(), key = { it._id }) { t ->
                Card(onClick = { onOpen(t.slug) }, modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        AsyncImage(model = t.coverImage, contentDescription = null, contentScale = ContentScale.Crop,
                            modifier = Modifier.width(96.dp).height(96.dp))
                        Column(Modifier.weight(1f)) {
                            Text(t.title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.titleMedium)
                            Text(t.brand + " · " + t.category, style = MaterialTheme.typography.bodySmall)
                            Text(if (t.stock > 0) "${t.stock} in stock" else "Sold out", style = MaterialTheme.typography.bodySmall)
                            Text(money(t.price), color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ToyDetailScreen(slug: String, onBack: () -> Unit) {
    var d by remember { mutableStateOf<ToyDetailResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(slug) {
        runCatching { Api.api.toy(slug) }.onSuccess { d = it }.onFailure { error = it.message }
    }

    val toy = d?.toy
    if (toy == null) {
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            TextButton(onClick = onBack) { Text("Back") }
            if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error) else Text("Loading…")
        }
        return
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack) { Text("Back") }
        AsyncImage(model = toy.coverImage, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().height(200.dp))
        Text(toy.title, style = MaterialTheme.typography.headlineSmall)
        Text(toy.brand + " · " + toy.category, style = MaterialTheme.typography.bodyMedium)
        Text(money(toy.price), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        if (toy.tagline.isNotBlank()) Text(toy.tagline)
        if (toy.description.isNotBlank()) Text(toy.description)
        Text("Ships from ${toy.warehouse} · ${if (toy.stock > 0) toy.stock.toString() + " in stock" else "Sold out"}")

        Button(onClick = {
            scope.launch {
                runCatching { Api.api.cartAdd(mapOf("toyId" to toy._id)) }
                    .onSuccess { message = "Added to cart" }
                    .onFailure { message = it.message }
            }
        }, enabled = toy.stock > 0) { Text("Add to cart") }

        d?.relatedGame?.let { related ->
            Text("Related game: ${related.title}", style = MaterialTheme.typography.bodySmall)
        }
        if (message != null) Text(message!!, color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
fun CommunityScreen(onOpen: (String) -> Unit, onNew: () -> Unit) {
    var posts by remember { mutableStateOf<List<Post>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        runCatching { Api.api.community() }.onSuccess { posts = it.posts }.onFailure { error = it.message }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Community", style = MaterialTheme.typography.headlineSmall)
            TextButton(onClick = onNew) { Text("New post") }
        }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
            items(posts, key = { it._id }) { p ->
                Card(onClick = { onOpen(p._id) }, modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text(p.title, style = MaterialTheme.typography.titleMedium)
                        Text("${p.author?.username ?: "anon"} · ${p.board} · ${p.replies.size} replies", style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }
}

@Composable
fun PostDetailScreen(id: String, onBack: () -> Unit) {
    var post by remember { mutableStateOf<Post?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var reply by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun load() {
        scope.launch {
            runCatching { Api.api.post(id) }.onSuccess { post = it.post }.onFailure { error = it.message }
        }
    }
    LaunchedEffect(id) { load() }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TextButton(onClick = onBack) { Text("Back") }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        post?.let { p ->
            Text(p.title, style = MaterialTheme.typography.headlineSmall)
            Text("${p.author?.username ?: "anon"} · ${p.board}", style = MaterialTheme.typography.bodySmall)
            Text(p.body)
            Text("Replies (${p.replies.size})", style = MaterialTheme.typography.titleMedium)
            p.replies.forEach { r ->
                Card(Modifier.fillMaxWidth()) { Column(Modifier.padding(10.dp)) {
                    Text("${r.user?.username ?: "anon"}", style = MaterialTheme.typography.bodySmall)
                    Text(r.text)
                } }
            }
            OutlinedTextField(reply, { reply = it }, label = { Text("Reply") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
            Button(enabled = !busy && reply.isNotBlank(), onClick = {
                busy = true
                scope.launch {
                    runCatching { Api.api.reply(id, mapOf("text" to reply)) }.onSuccess { reply = ""; load() }.onFailure { error = it.message }
                    busy = false
                }
            }) { Text("Reply") }
        }
    }
}

@Composable
fun NewPostScreen(onDone: () -> Unit, onBack: () -> Unit) {
    var board by remember { mutableStateOf("general") }
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TextButton(onClick = onBack) { Text("Back") }
        Text("New post", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(board, { board = it }, label = { Text("Board") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(title, { title = it }, label = { Text("Title") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(body, { body = it }, label = { Text("Body") }, modifier = Modifier.fillMaxWidth(), minLines = 3)
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        Button(enabled = !busy && title.isNotBlank() && body.isNotBlank(), onClick = {
            busy = true
            scope.launch {
                runCatching { Api.api.newPost(mapOf("board" to board, "title" to title, "body" to body)) }
                    .onSuccess { onDone() }
                    .onFailure { error = it.message }
                busy = false
            }
        }) { Text("Post") }
    }
}

@Composable
fun RecommendationsScreen() {
    var d by remember { mutableStateOf<RecommendationsResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(Unit) {
        runCatching { Api.api.recommendations() }.onSuccess { d = it }.onFailure { error = it.message }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("For you", style = MaterialTheme.typography.headlineSmall)
        d?.topGenres?.takeIf { it.isNotEmpty() }?.let { Text("Based on: " + it.joinToString(", "), style = MaterialTheme.typography.bodySmall) }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
            items(d?.recs ?: emptyList(), key = { it._id }) { g ->
                Card(onClick = { }, modifier = Modifier.fillMaxWidth()) {
                    Row(Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        AsyncImage(model = g.coverImage, contentDescription = null, contentScale = ContentScale.Crop,
                            modifier = Modifier.width(120.dp).height(68.dp))
                        Column(Modifier.weight(1f)) {
                            Text(g.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            Text(g.genres.take(2).joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                            Text(money(g.finalPrice), color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ProfileScreen(username: String, onBack: () -> Unit) {
    var d by remember { mutableStateOf<ProfileResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var bio by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var message by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(username) {
        runCatching { Api.api.profile(username) }.onSuccess {
            d = it; bio = it.user.bio; displayName = it.user.displayName
        }.onFailure { error = it.message }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        TextButton(onClick = onBack) { Text("Back") }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        d?.let { p ->
            Text(p.user.displayName.ifBlank { p.user.username }, style = MaterialTheme.typography.headlineSmall)
            Text("@" + p.user.username + " · " + p.user.role, style = MaterialTheme.typography.bodySmall)
            if (p.user.bio.isNotBlank()) Text(p.user.bio)
            Text("Library (${p.user.library.size}) · Wishlist (${p.user.wishlist.size})", style = MaterialTheme.typography.bodySmall)
            if (p.isSelf) {
                OutlinedTextField(displayName, { displayName = it }, label = { Text("Display name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(bio, { bio = it }, label = { Text("Bio") }, modifier = Modifier.fillMaxWidth(), minLines = 2)
                Button(onClick = {
                    scope.launch {
                        runCatching { Api.api.updateMe(mapOf("displayName" to displayName, "bio" to bio)) }
                            .onSuccess { message = "Saved" }
                            .onFailure { message = it.message }
                    }
                }) { Text("Save") }
                if (message != null) Text(message!!, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}
