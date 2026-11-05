package com.pixelvault.mobile.model

data class User(
    val _id: String = "",
    val username: String = "",
    val role: String = "user",
    val email: String = ""
)

data class Stats(
    val reviewCount: Int = 0,
    val reviewSum: Int = 0,
    val views: Int = 0,
    val unitsDigital: Int = 0
)

data class Game(
    val _id: String = "",
    val title: String = "",
    val slug: String = "",
    val coverImage: String = "",
    val genres: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val platforms: List<String> = emptyList(),
    val price: Double = 0.0,
    val discountPct: Int = 0,
    val stats: Stats? = null,
    val tagline: String = "",
    val description: String = "",
    val studioName: String = "",
    val publisher: String = "",
    val releaseDate: String? = null,
    val screenshots: List<String> = emptyList(),
    val categories: List<String> = emptyList(),
    val features: List<String> = emptyList(),
    val deckVerified: String = "",
    val contentWarnings: List<String> = emptyList()
) {
    val finalPrice: Double
        get() = price * (1 - (discountPct.toDouble() / 100.0))
    val reviewAverage: Double?
        get() {
            val s = stats ?: return null
            return if (s.reviewCount > 0) s.reviewSum.toDouble() / s.reviewCount else null
        }
}

data class GamesResponse(
    val games: List<Game> = emptyList(),
    val total: Int = 0,
    val totalPages: Int = 0,
    val page: Int = 1,
    val genres: List<String> = emptyList(),
    val tags: List<String> = emptyList(),
    val categories: List<String> = emptyList(),
    val platforms: List<String> = emptyList()
)

data class Review(
    val _id: String = "",
    val title: String = "",
    val body: String = "",
    val stars: Int = 0,
    val user: User? = null
)

data class GameDetailResponse(
    val game: Game = Game(),
    val reviews: List<Review> = emptyList(),
    val buyable: Boolean = true,
    val supplier: Boolean = false
)

data class CartItem(
    val key: String = "",
    val title: String = "",
    val kind: String = "game",
    val edition: String = "",
    val slug: String = "",
    val coverImage: String = "",
    val unitPrice: Double = 0.0,
    val qty: Int = 1
)

data class Cart(
    val items: List<CartItem> = emptyList(),
    val subtotal: Double = 0.0
)

data class CheckoutSummary(
    val items: List<CartItem> = emptyList(),
    val subtotal: Double = 0.0,
    val tax: Double = 0.0,
    val shipCost: Double = 0.0,
    val grand: Double = 0.0
)

data class PlaceOrderResponse(
    val orderId: String = "",
    val paymentUrl: String = ""
)

data class OrderItem(
    val title: String = "",
    val edition: String = "",
    val qty: Int = 1,
    val unitPrice: Double = 0.0
)

data class Order(
    val _id: String = "",
    val status: String = "pending",
    val grandTotal: Double = 0.0,
    val createdAt: String = "",
    val items: List<OrderItem> = emptyList()
)

data class OrdersResponse(
    val orders: List<Order> = emptyList()
)

data class OrderDetailResponse(
    val order: Order = Order(),
    val plainById: Map<String, String> = emptyMap()
)

data class LibraryEntry(
    val game: Game? = null,
    val edition: String = "",
    val playMinutes: Int = 0
)

data class LibraryUser(
    val username: String = "",
    val library: List<LibraryEntry> = emptyList(),
    val wishlist: List<Game> = emptyList()
)

data class LibraryResponse(
    val user: LibraryUser = LibraryUser(),
    val keysByGame: Map<String, List<Map<String, String>>> = emptyMap(),
    val plainById: Map<String, String> = emptyMap()
)

data class AuthResponse(
    val user: User? = null
)
