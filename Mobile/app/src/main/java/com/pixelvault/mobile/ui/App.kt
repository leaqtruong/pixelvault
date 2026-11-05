package com.pixelvault.mobile.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.pixelvault.mobile.api.Api
import com.pixelvault.mobile.model.User
import kotlinx.coroutines.launch

sealed class Route {
    data object Store : Route()
    data class Game(val slug: String) : Route()
    data object Cart : Route()
    data object Checkout : Route()
    data object Orders : Route()
    data object Library : Route()
    data object Account : Route()
    data object Login : Route()
    data object Register : Route()
    data object QrScan : Route()
    data object Toys : Route()
    data class Toy(val slug: String) : Route()
    data object Community : Route()
    data class Post(val id: String) : Route()
    data object NewPost : Route()
    data object Recommendations : Route()
    data class Profile(val username: String) : Route()
}

@Composable
fun App() {
    var user by remember { mutableStateOf<User?>(null) }
    val backStack = remember { mutableStateListOf<Route>(Route.Store) }
    val current = backStack.last()

    fun push(route: Route) = backStack.add(route)
    fun pop() { if (backStack.size > 1) backStack.removeAt(backStack.lastIndex) }
    fun replace(route: Route) { backStack[backStack.lastIndex] = route }

    BackHandler(enabled = backStack.size > 1) { pop() }

    LaunchedEffect(Unit) {
        runCatching { Api.api.me().user }.onSuccess { if (it != null) user = it }
    }

    val showTabs = current is Route.Store || current is Route.Community || current is Route.Library || current is Route.Account

    Scaffold(
        bottomBar = {
            if (showTabs) {
                NavigationBar {
                    NavigationBarItem(selected = current is Route.Store, onClick = { replace(Route.Store) },
                        icon = { Text("S") }, label = { Text("Store") })
                    NavigationBarItem(selected = current is Route.Community, onClick = { replace(Route.Community) },
                        icon = { Text("C") }, label = { Text("Community") })
                    NavigationBarItem(selected = current is Route.Library, onClick = { replace(Route.Library) },
                        icon = { Text("L") }, label = { Text("Library") })
                    NavigationBarItem(selected = current is Route.Account, onClick = { replace(Route.Account) },
                        icon = { Text("A") }, label = { Text("Account") })
                }
            }
        }
    ) { padding ->
        Box(Modifier.fillMaxSize().padding(padding)) {
            when (current) {
                is Route.Store -> StoreScreen(onOpen = { push(Route.Game(it)) }, onCart = { push(Route.Cart) }, onToys = { push(Route.Toys) })
                is Route.Game -> GameScreen(current.slug, user, onBack = { pop() }, onCart = { push(Route.Cart) })
                is Route.Cart -> CartScreen(onBack = { pop() }, onCheckout = { push(Route.Checkout) })
                is Route.Checkout -> CheckoutScreen(onBack = { pop() }, onDone = { replace(Route.Orders) })
                is Route.Orders -> OrdersScreen()
                is Route.Library -> LibraryScreen(user)
                is Route.Account -> AccountScreen(
                    user = user,
                    onLogin = { push(Route.Login) },
                    onRegister = { push(Route.Register) },
                    onQr = { push(Route.QrScan) },
                    onOrders = { push(Route.Orders) },
                    onRecommendations = { push(Route.Recommendations) },
                    onProfile = { user?.let { push(Route.Profile(it.username)) } },
                    onLogout = {
                        runCatching { Api.api.logout() }
                        Api.logout()
                        user = null
                    }
                )
                is Route.Toys -> ToysScreen(onOpen = { push(Route.Toy(it)) }, onBack = { pop() })
                is Route.Toy -> ToyDetailScreen(current.slug, onBack = { pop() })
                is Route.Community -> CommunityScreen(onOpen = { push(Route.Post(it)) }, onNew = { push(Route.NewPost) })
                is Route.Post -> PostDetailScreen(current.id, onBack = { pop() })
                is Route.NewPost -> NewPostScreen(onDone = { pop() }, onBack = { pop() })
                is Route.Recommendations -> RecommendationsScreen()
                is Route.Profile -> ProfileScreen(current.username, onBack = { pop() })
                is Route.Login -> LoginScreen(
                    onLogin = { user = it; pop() },
                    onRegister = { push(Route.Register) }
                )
                is Route.Register -> RegisterScreen(onRegistered = { user = it; pop() })
                is Route.QrScan -> QrScanScreen(onBack = { pop() })
            }
        }
    }
}

@Composable
fun AccountScreen(
    user: User?,
    onLogin: () -> Unit,
    onRegister: () -> Unit,
    onQr: () -> Unit,
    onOrders: () -> Unit,
    onRecommendations: () -> Unit,
    onProfile: () -> Unit,
    onLogout: () -> Unit
) {
    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Account", style = MaterialTheme.typography.headlineSmall)
        if (user == null) {
            Button(onClick = onLogin) { Text("Log in") }
            OutlinedButton(onClick = onRegister) { Text("Join free") }
        } else {
            Text("Signed in as ${user.username} (${user.role})")
            Button(onClick = onProfile) { Text("My profile") }
            OutlinedButton(onClick = onOrders) { Text("Order history") }
            OutlinedButton(onClick = onRecommendations) { Text("Recommendations") }
            Button(onClick = onQr) { Text("Scan web QR to sign in") }
            OutlinedButton(onClick = onLogout) { Text("Log out") }
        }
        Text("QR login lets you sign into the website by scanning the code on its login page with this phone.")
    }
}

@Composable
fun LoginScreen(onLogin: (User) -> Unit, onRegister: () -> Unit) {
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Log in", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        Button(enabled = !busy, onClick = {
            busy = true
            scope.launch {
                runCatching { Api.api.login(mapOf("email" to email, "password" to password)).user }
                    .onSuccess { if (it != null) onLogin(it) else error = "Login failed" }
                    .onFailure { error = it.message ?: "Login failed" }
                busy = false
            }
        }) { Text("Log in") }
        TextButton(onClick = onRegister) { Text("No account? Join free") }
        Text("Demo: gamer@vault.gg / password123", style = MaterialTheme.typography.bodySmall)
    }
}

@Composable
fun RegisterScreen(onRegistered: (User) -> Unit) {
    var username by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(Modifier.fillMaxSize().padding(16.dp).verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Join free", style = MaterialTheme.typography.headlineSmall)
        OutlinedTextField(username, { username = it }, label = { Text("Username") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
        Button(enabled = !busy, onClick = {
            busy = true
            scope.launch {
                runCatching {
                    Api.api.register(mapOf("username" to username, "email" to email, "password" to password)).user
                }.onSuccess { if (it != null) onRegistered(it) else error = "Registration failed" }
                    .onFailure { error = it.message ?: "Registration failed" }
                busy = false
            }
        }) { Text("Register") }
    }
}
