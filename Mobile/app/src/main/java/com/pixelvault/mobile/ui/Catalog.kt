package com.pixelvault.mobile.ui

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import com.pixelvault.mobile.api.Api
import com.pixelvault.mobile.model.*
import kotlinx.coroutines.launch
import java.util.Locale

private fun money(v: Double): String = "$" + String.format(Locale.US, "%.2f", v)

@Composable
fun StoreScreen(onOpen: (String) -> Unit, onCart: () -> Unit, onToys: () -> Unit) {
    var query by remember { mutableStateOf("") }
    var genre by remember { mutableStateOf<String?>(null) }
    var refresh by remember { mutableStateOf(0) }
    var data by remember { mutableStateOf<GamesResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }

    LaunchedEffect(refresh, genre) {
        loading = true
        runCatching { Api.api.games(q = query.ifBlank { null }, genre = genre) }
            .onSuccess { data = it; error = null }
            .onFailure { error = it.message ?: "Could not load the catalog" }
        loading = false
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
            OutlinedTextField(query, { query = it }, label = { Text("Search") }, singleLine = true, modifier = Modifier.weight(1f))
            Button(onClick = { refresh++ }, modifier = Modifier.padding(start = 8.dp)) { Text("Go") }
            TextButton(onClick = onCart) { Text("Cart") }
            TextButton(onClick = onToys) { Text("Merch") }
        }
        val genres = data?.genres ?: emptyList()
        if (genres.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = genre == null, onClick = { genre = null }, label = { Text("All") })
                genres.take(20).forEach { g ->
                    FilterChip(selected = genre == g, onClick = { genre = if (genre == g) null else g }, label = { Text(g) })
                }
            }
        }
        if (loading) { LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical = 8.dp)) }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        val games = data?.games ?: emptyList()
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
            items(games) { g -> GameCard(g, onClick = { onOpen(g.slug) }) }
        }
    }
}

@Composable
private fun GameCard(g: Game, onClick: () -> Unit) {
    Card(onClick = onClick, modifier = Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth().padding(10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            AsyncImage(
                model = g.coverImage,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.width(120.dp).height(68.dp)
            )
            Column(Modifier.weight(1f)) {
                Text(g.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(g.genres.take(2).joinToString(" · "), style = MaterialTheme.typography.bodySmall)
                Text(money(g.finalPrice), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            }
        }
    }
}

@Composable
fun GameScreen(slug: String, user: User?, onBack: () -> Unit, onCart: () -> Unit) {
    var d by remember { mutableStateOf<GameDetailResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(slug) {
        runCatching { Api.api.game(slug) }
            .onSuccess { d = it }
            .onFailure { error = it.message ?: "Could not load game" }
    }

    val game = d?.game
    if (game == null) {
        Column(Modifier.fillMaxSize().padding(16.dp)) {
            TextButton(onClick = onBack) { Text("Back") }
            if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error) else Text("Loading…")
        }
        return
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        TextButton(onClick = onBack) { Text("Back") }
        AsyncImage(model = game.coverImage, contentDescription = null, contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().height(180.dp))
        Text(game.title, style = MaterialTheme.typography.headlineSmall)
        Text(game.genres.joinToString(" · "), style = MaterialTheme.typography.bodyMedium)
        Text(money(game.finalPrice), style = MaterialTheme.typography.titleLarge, color = MaterialTheme.colorScheme.primary)
        if (game.tagline.isNotBlank()) Text(game.tagline)
        if (game.description.isNotBlank()) Text(game.description.replace(Regex("<[^>]*>"), ""))
        game.reviewAverage?.let { Text(String.format(Locale.US, "%.1f/5 · %d reviews", it, game.stats?.reviewCount ?: 0), style = MaterialTheme.typography.bodySmall) }

        Button(onClick = {
            busy = true
            scope.launch {
                runCatching { Api.api.cartAdd(mapOf("gameId" to game._id, "edition" to "digital")) }
                    .onSuccess { onCart() }
                    .onFailure { error = it.message }
                busy = false
            }
        }, enabled = !busy) { Text("Add to cart") }

        OutlinedButton(onClick = {
            scope.launch { runCatching { Api.api.wishlist(game._id) } }
        }) { Text("Wishlist") }
    }
}

@Composable
fun CartScreen(onBack: () -> Unit, onCheckout: () -> Unit) {
    var cart by remember { mutableStateOf<Cart?>(null) }
    var refresh by remember { mutableStateOf(0) }
    var error by remember { mutableStateOf<String?>(null) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(refresh) {
        runCatching { Api.api.cart() }.onSuccess { cart = it }.onFailure { error = it.message }
    }

    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Cart", style = MaterialTheme.typography.headlineSmall)
        TextButton(onClick = onBack) { Text("Back") }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        val items = cart?.items ?: emptyList()
        if (items.isEmpty()) {
            Text("Your cart is empty.")
        } else {
            LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.weight(1f)) {
                items(items, key = { it.key }) { i ->
                    Card(Modifier.fillMaxWidth()) {
                        Row(Modifier.padding(10.dp).fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                            AsyncImage(model = i.coverImage, contentDescription = null, contentScale = ContentScale.Crop,
                                modifier = Modifier.width(80.dp).height(45.dp))
                            Column(Modifier.weight(1f)) {
                                Text(i.title, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("${i.qty} × ${money(i.unitPrice)}", style = MaterialTheme.typography.bodySmall)
                            }
                            TextButton(onClick = {
                                scope.launch { runCatching { Api.api.cartRemove(mapOf("key" to i.key)) }.onSuccess { refresh++ } }
                            }) { Text("Remove") }
                        }
                    }
                }
            }
            Text("Subtotal: ${money(cart?.subtotal ?: 0.0)}", style = MaterialTheme.typography.titleMedium)
            Button(onClick = onCheckout, enabled = items.isNotEmpty(), modifier = Modifier.fillMaxWidth()) { Text("Checkout") }
        }
    }
}

@Composable
fun CheckoutScreen(onBack: () -> Unit, onDone: () -> Unit) {
    var summary by remember { mutableStateOf<CheckoutSummary?>(null) }
    var fullName by remember { mutableStateOf("") }
    var street by remember { mutableStateOf("") }
    var city by remember { mutableStateOf("") }
    var country by remember { mutableStateOf("US") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        runCatching { Api.api.checkoutSummary("standard") }.onSuccess { summary = it }.onFailure { error = it.message }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Checkout", style = MaterialTheme.typography.headlineSmall)
        TextButton(onClick = onBack) { Text("Back") }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        summary?.let {
            Text("Total: ${money(it.grand)}", style = MaterialTheme.typography.titleLarge)
            Text("Subtotal ${money(it.subtotal)} · Tax ${money(it.tax)} · Shipping ${money(it.shipCost)}", style = MaterialTheme.typography.bodySmall)
        }
        OutlinedTextField(fullName, { fullName = it }, label = { Text("Full name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(street, { street = it }, label = { Text("Street") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(city, { city = it }, label = { Text("City") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(country, { country = it }, label = { Text("Country") }, singleLine = true, modifier = Modifier.fillMaxWidth())

        Button(onClick = {
            busy = true
            scope.launch {
                runCatching {
                    Api.api.checkoutPlace(mapOf(
                        "method" to "standard",
                        "fullName" to fullName,
                        "street" to street,
                        "city" to city,
                        "country" to country
                    ))
                }.onSuccess { r ->
                    if (r.paymentUrl.isNotBlank()) {
                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(r.paymentUrl)))
                    }
                    onDone()
                }.onFailure { error = it.message }
                busy = false
            }
        }, enabled = !busy && fullName.isNotBlank() && street.isNotBlank() && city.isNotBlank(), modifier = Modifier.fillMaxWidth()) {
            Text("Place order")
        }
    }
}

@Composable
fun OrdersScreen() {
    var orders by remember { mutableStateOf<List<Order>>(emptyList()) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(Unit) {
        runCatching { Api.api.orders() }.onSuccess { orders = it.orders }.onFailure { error = it.message }
        loading = false
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Order history", style = MaterialTheme.typography.headlineSmall)
        if (loading) { LinearProgressIndicator(Modifier.fillMaxWidth().padding(vertical = 8.dp)) }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        if (orders.isEmpty() && !loading) Text("No orders yet.")
        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
            items(orders, key = { it._id }) { o ->
                Card(Modifier.fillMaxWidth()) {
                    Column(Modifier.padding(12.dp)) {
                        Text("Order #${o._id.takeLast(6)}", style = MaterialTheme.typography.titleMedium)
                        Text("${o.items.sumOf { it.qty }} units · ${o.status}", style = MaterialTheme.typography.bodySmall)
                        Text(money(o.grandTotal), color = MaterialTheme.colorScheme.primary)
                    }
                }
            }
        }
    }
}

@Composable
fun LibraryScreen(user: User?) {
    var lib by remember { mutableStateOf<LibraryResponse?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(user) {
        if (user != null) {
            runCatching { Api.api.library() }.onSuccess { lib = it }.onFailure { error = it.message }
        }
    }

    Column(Modifier.fillMaxSize().padding(16.dp)) {
        Text("Library", style = MaterialTheme.typography.headlineSmall)
        if (user == null) {
            Text("Log in to see games you own and your wishlist.")
            return@Column
        }
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        val owned = lib?.user?.library?.mapNotNull { it.game } ?: emptyList()
        val wish = lib?.user?.wishlist ?: emptyList()
        LazyColumn(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
            item { Text("Owned (${owned.size})", style = MaterialTheme.typography.titleMedium) }
            items(owned, key = { it._id }) { g -> GameCard(g, onClick = {}) }
            item { Text("Wishlist (${wish.size})", style = MaterialTheme.typography.titleMedium) }
            items(wish, key = { it._id }) { g -> GameCard(g, onClick = {}) }
        }
    }
}
