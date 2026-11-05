package com.pixelvault.mobile.api

import android.content.Context
import android.content.SharedPreferences
import com.pixelvault.mobile.model.*
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

interface PixelVaultApi {
    @POST("auth/login")
    suspend fun login(@Body body: Map<String, String>): AuthResponse

    @POST("auth/register")
    suspend fun register(@Body body: Map<String, String>): AuthResponse

    @GET("auth/me")
    suspend fun me(): AuthResponse

    @POST("auth/logout")
    suspend fun logout(): Map<String, Any>

    @GET("games")
    suspend fun games(
        @Query("q") q: String? = null,
        @Query("genre") genre: String? = null,
        @Query("tag") tag: String? = null,
        @Query("platform") platform: String? = null,
        @Query("sort") sort: String = "popular",
        @Query("onSale") onSale: String? = null,
        @Query("page") page: Int = 1,
        @Query("limit") limit: Int = 24
    ): GamesResponse

    @GET("games/{slug}")
    suspend fun game(@Path("slug") slug: String): GameDetailResponse

    @POST("games/{id}/wishlist")
    suspend fun wishlist(@Path("id") id: String): Map<String, Any>

    @GET("cart")
    suspend fun cart(): Cart

    @POST("cart/add")
    suspend fun cartAdd(@Body body: Map<String, String>): Map<String, Any>

    @POST("cart/qty")
    suspend fun cartQty(@Body body: Map<String, String>): Map<String, Any>

    @POST("cart/remove")
    suspend fun cartRemove(@Body body: Map<String, String>): Map<String, Any>

    @GET("checkout/summary")
    suspend fun checkoutSummary(@Query("method") method: String = "standard"): CheckoutSummary

    @POST("checkout/place")
    suspend fun checkoutPlace(@Body body: Map<String, String>): PlaceOrderResponse

    @GET("orders")
    suspend fun orders(): OrdersResponse

    @GET("orders/{id}")
    suspend fun order(@Path("id") id: String): OrderDetailResponse

    @POST("orders/{id}/cancel")
    suspend fun cancelOrder(@Path("id") id: String): Map<String, Any>

    @GET("library")
    suspend fun library(): LibraryResponse

    @POST("qrlogin/confirm")
    suspend fun qrConfirm(@Body body: Map<String, String>): Map<String, Any>

    @GET("toys")
    suspend fun toys(
        @Query("category") category: String? = null,
        @Query("brand") brand: String? = null,
        @Query("sort") sort: String = "popular"
    ): ToysResponse

    @GET("toys/{slug}")
    suspend fun toy(@Path("slug") slug: String): ToyDetailResponse

    @POST("toys/{id}/wishlist")
    suspend fun toyWishlist(@Path("id") id: String): Map<String, Any>

    @GET("recommendations")
    suspend fun recommendations(): RecommendationsResponse

    @GET("community")
    suspend fun community(): CommunityResponse

    @GET("community/p/{id}")
    suspend fun post(@Path("id") id: String): PostDetailResponse

    @POST("community/new")
    suspend fun newPost(@Body body: Map<String, String>): Map<String, Any>

    @POST("community/p/{id}/reply")
    suspend fun reply(@Path("id") id: String, @Body body: Map<String, String>): Map<String, Any>

    @GET("users/{username}")
    suspend fun profile(@Path("username") username: String): ProfileResponse

    @POST("users/me")
    suspend fun updateMe(@Body body: Map<String, String>): Map<String, Any>
}

class SessionInterceptor(private val prefs: SharedPreferences) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val cookieName = "connect.sid"
        val sid = prefs.getString(cookieName, null)
        val request = if (sid != null) {
            chain.request().newBuilder().header("Cookie", "$cookieName=$sid").build()
        } else {
            chain.request()
        }
        val response = chain.proceed(request)
        for (header in response.headers("Set-Cookie")) {
            val first = header.substringBefore(';')
            val parts = first.split('=', limit = 2)
            if (parts.size == 2 && parts[0].trim() == cookieName) {
                prefs.edit().putString(cookieName, parts[1].trim()).apply()
            }
        }
        return response
    }
}

object Api {
    private lateinit var prefs: SharedPreferences

    fun init(context: Context) {
        prefs = context.getSharedPreferences("pixelvault", Context.MODE_PRIVATE)
    }

    // Android emulator maps 10.0.2.2 to the host machine's localhost.
    // On a real phone, replace this with the machine's LAN IP (see README).
    val baseUrl: String
        get() = prefs.getString("base_url", "http://10.0.2.2:3000/api/") ?: "http://10.0.2.2:3000/api/"

    val api: PixelVaultApi by lazy {
        val client = OkHttpClient.Builder()
            .addInterceptor(SessionInterceptor(prefs))
            .connectTimeout(20, TimeUnit.SECONDS)
            .readTimeout(20, TimeUnit.SECONDS)
            .build()
        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(PixelVaultApi::class.java)
    }

    fun isLoggedIn(): Boolean = prefs.getString("connect.sid", null) != null

    fun logout() {
        prefs.edit().remove("connect.sid").apply()
    }
}
