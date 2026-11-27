package store.karthiktraders.jyotisha;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private BillingClient client;
    private PluginCall purchaseCall;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
    }

    private void ready(final PluginCall call, final Runnable action) {
        if (client.isReady()) { action.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) action.run();
                else call.reject("Google Play Billing unavailable: " + result.getDebugMessage(), "BILLING_UNAVAILABLE");
            }
            @Override public void onBillingServiceDisconnected() { }
        });
    }

    private QueryProductDetailsParams queryParams(List<String> ids) {
        List<QueryProductDetailsParams.Product> products = new ArrayList<>();
        for (String id : ids) products.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id).setProductType(BillingClient.ProductType.INAPP).build());
        return QueryProductDetailsParams.newBuilder().setProductList(products).build();
    }

    private ProductDetails.OneTimePurchaseOfferDetails firstOffer(ProductDetails detail) {
        List<ProductDetails.OneTimePurchaseOfferDetails> offers = detail.getOneTimePurchaseOfferDetailsList();
        if (offers != null && !offers.isEmpty()) return offers.get(0);
        return detail.getOneTimePurchaseOfferDetails();
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        JSArray input = call.getArray("productIds");
        if (input == null || input.length() == 0) { call.reject("productIds required"); return; }
        List<String> ids = new ArrayList<>();
        try { for (int i = 0; i < input.length(); i++) ids.add(input.getString(i)); }
        catch (Exception error) { call.reject("invalid productIds"); return; }
        ready(call, () -> client.queryProductDetailsAsync(queryParams(ids), (result, queryResult) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject(result.getDebugMessage(), "QUERY_FAILED"); return; }
            JSArray products = new JSArray();
            for (ProductDetails detail : queryResult.getProductDetailsList()) {
                ProductDetails.OneTimePurchaseOfferDetails offer = firstOffer(detail);
                if (offer == null) continue;
                JSObject row = new JSObject();
                row.put("productId", detail.getProductId()); row.put("title", detail.getTitle());
                row.put("description", detail.getDescription()); row.put("formattedPrice", offer.getFormattedPrice());
                row.put("priceAmountMicros", offer.getPriceAmountMicros()); row.put("priceCurrencyCode", offer.getPriceCurrencyCode());
                products.put(row);
            }
            JSObject reply = new JSObject(); reply.put("products", products); call.resolve(reply);
        }));
    }

    @PluginMethod
    public synchronized void purchase(PluginCall call) {
        String productId = call.getString("productId", "");
        if (productId.isEmpty()) { call.reject("productId required"); return; }
        if (purchaseCall != null) { call.reject("another purchase is already open", "PURCHASE_IN_PROGRESS"); return; }
        ready(call, () -> client.queryProductDetailsAsync(queryParams(Collections.singletonList(productId)), (result, queryResult) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || queryResult.getProductDetailsList().isEmpty()) {
                call.reject("This product is not available in Google Play", "PRODUCT_UNAVAILABLE"); return;
            }
            ProductDetails detail = queryResult.getProductDetailsList().get(0);
            ProductDetails.OneTimePurchaseOfferDetails offer = firstOffer(detail);
            if (offer == null) { call.reject("No eligible purchase option is available", "PRODUCT_UNAVAILABLE"); return; }
            BillingFlowParams.ProductDetailsParams.Builder productBuilder = BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(detail);
            String offerToken = offer.getOfferToken();
            if (offerToken != null && !offerToken.isEmpty()) productBuilder.setOfferToken(offerToken);
            BillingFlowParams.ProductDetailsParams product = productBuilder.build();
            BillingFlowParams.Builder flow = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(product));
            String account = call.getString("obfuscatedAccountId", "");
            if (!account.isEmpty()) flow.setObfuscatedAccountId(account);
            synchronized (PlayBillingPlugin.this) { purchaseCall = call; }
            BillingResult launched = client.launchBillingFlow(getActivity(), flow.build());
            if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                synchronized (PlayBillingPlugin.this) { purchaseCall = null; }
                call.reject(launched.getDebugMessage(), "PURCHASE_NOT_LAUNCHED");
            }
        }));
    }

    @Override
    public synchronized void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = purchaseCall; purchaseCall = null;
        if (call == null) return;
        if (result.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) { call.reject("Purchase cancelled", "PURCHASE_CANCELLED"); return; }
        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK || purchases == null || purchases.isEmpty()) {
            call.reject(result.getDebugMessage(), "PURCHASE_FAILED"); return;
        }
        Purchase purchase = purchases.get(0);
        if (purchase.getPurchaseState() != Purchase.PurchaseState.PURCHASED) { call.reject("Purchase is pending", "PURCHASE_PENDING"); return; }
        call.resolve(purchaseJson(purchase));
    }

    private JSObject purchaseJson(Purchase purchase) {
        JSObject row = new JSObject(); row.put("purchaseToken", purchase.getPurchaseToken());
        row.put("orderId", purchase.getOrderId()); row.put("acknowledged", purchase.isAcknowledged());
        row.put("products", new JSArray(purchase.getProducts())); return row;
    }

    @PluginMethod
    public void completePurchase(PluginCall call) {
        String token = call.getString("purchaseToken", "");
        if (token.isEmpty()) { call.reject("purchaseToken required"); return; }
        ready(call, () -> client.consumeAsync(ConsumeParams.newBuilder().setPurchaseToken(token).build(), (result, consumedToken) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject(result.getDebugMessage(), "CONSUME_FAILED"); return; }
            JSObject reply = new JSObject(); reply.put("purchaseToken", consumedToken); call.resolve(reply);
        }));
    }

    @PluginMethod
    public void restorePurchases(PluginCall call) {
        ready(call, () -> client.queryPurchasesAsync(QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.INAPP).build(), (result, purchases) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject(result.getDebugMessage(), "RESTORE_FAILED"); return; }
            JSArray rows = new JSArray();
            for (Purchase purchase : purchases) if (purchase.getPurchaseState() == Purchase.PurchaseState.PURCHASED) rows.put(purchaseJson(purchase));
            JSObject reply = new JSObject(); reply.put("purchases", rows); call.resolve(reply);
        }));
    }

    @Override
    protected void handleOnDestroy() {
        if (client != null) client.endConnection();
        super.handleOnDestroy();
    }
}
