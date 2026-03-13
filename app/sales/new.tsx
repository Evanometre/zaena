// FILE: app/sales/new.tsx
import { InvoiceData, InvoiceGenerator } from "@/lib/invoices";
import { getOrganization } from "@/onboarding/services/organizationService";

import {
  ALL_CURRENCIES,
  getCurrencyForTimezone,
} from "@/onboarding/utility/timezoneCurrencyMap";
import { useAuthStore } from "@/stores/authStore";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import NetInfo from "@react-native-community/netinfo";
import * as Crypto from "expo-crypto";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";

import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Toast } from "react-native-toast-message/lib/src/Toast";
import FloatingReceiptShare from "../../components/Floatingreceiptshare";
import { usePermissions } from "../../context/PermissionsContext";
import { queueSale } from "../../lib/localDb";
import supabase from "../../lib/supabase";
import { syncOutbox } from "../../lib/syncEngine";
import { useTheme } from "../../lib/theme/ThemeProvider";

interface Product {
  id: string;
  name: string;
  unit: string;
  category: string;
  default_selling_price?: number;
  product_type?: string;
  is_sellable?: boolean;
}

interface BulkPrice {
  id: string;
  name: string;
  quantity_multiplier: number;
  unit_price: number;
}

interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  unit_cogs: number;
  location_id?: string;
  location_name?: string;
}

interface CheckoutCache {
  userId: string;
  organizationId: string;
  deviceId: string;
  deviceName: string;
}

export default function NewSaleScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const c = theme.colors;
  const t = theme.typography;
  const sp = theme.spacing;
  const insets = useSafeAreaInsets();
  const [currency, setCurrency] = useState({
    symbol: "",
    code: "NGN",
    name: "Nigerian Naira",
  });
  const { organizationId } = useAuthStore();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPrePaymentModal, setShowPrePaymentModal] = useState(false);
  const [prePaymentAmount, setPrePaymentAmount] = useState("");
  const [initialLoading, setInitialLoading] = useState(false);
  const [editingPriceFor, setEditingPriceFor] = useState<string | null>(null);
  const [transactionDate, setTransactionDate] = useState(new Date());
  const [isBackdated, setIsBackdated] = useState(false);
  const [showBulkPriceModal, setShowBulkPriceModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [productBulkPrices, setProductBulkPrices] = useState<BulkPrice[]>([]);
  const [selectedBulkPrice, setSelectedBulkPrice] = useState<BulkPrice | null>(
    null,
  );
  const completedSaleRef = useRef<typeof completedSale>(null);
  const [completedCartSnapshot, setCompletedCartSnapshot] = useState<
    CartItem[]
  >([]);
  const [bulkQuantity, setBulkQuantity] = useState("1");
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">(
    "fixed",
  );
  const [orgTimezone, setOrgTimezone] = useState<string | null>(null);
  const [taxRate, setTaxRate] = useState(0);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [selectedLocation, setSelectedLocation] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [productsInStock, setProductsInStock] = useState<string[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [pendingLocation, setPendingLocation] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [inventoryCostMap, setInventoryCostMap] = useState<
    Map<string, { cost: number; stock: number }>
  >(new Map());
  const [bulkPriceMap, setBulkPriceMap] = useState<Map<string, BulkPrice[]>>(
    new Map(),
  );
  const checkoutCacheRef = useRef<CheckoutCache | null>(null);
  const [workflowMode, setWorkflowMode] = useState<"solo" | "team">("solo");
  const [customers, setCustomers] = useState<
    { id: string; name: string; email?: string; phone?: string }[]
  >([]);

  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string;
    name: string;
    email?: string;
    phone?: string;
  } | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [editingQtyFor, setEditingQtyFor] = useState<{
    productId: string;
  } | null>(null);
  const [showReceiptShare, setShowReceiptShare] = useState(false);
  const [completedSale, setCompletedSale] = useState<{
    id: string;
    receiptNumber: string;
    totalAmount: number;
    customerId?: string;
    paymentStatus: "paid" | "partial" | "unpaid";
    amountPaid: number;
    paymentMethod?: string;
  } | null>(null);

  useEffect(() => {
    if (!permissionsLoading && !hasPermission("sales.create")) {
      Alert.alert(
        "Access Denied",
        "You don't have permission to create sales",
        [{ text: "OK", onPress: () => router.back() }],
      );
    }
  }, [permissionsLoading, hasPermission]);

  useEffect(() => {
    async function loadOrgCurrency() {
      if (!organizationId) return;
      try {
        const org = await getOrganization(organizationId);
        if (org.currency) {
          const match = ALL_CURRENCIES.find((c) => c.code === org.currency);
          setCurrency({
            code: org.currency,
            symbol: match?.symbol ?? org.currency,
            name: match?.name ?? "",
          });
        } else if (org.timezone) {
          setCurrency(getCurrencyForTimezone(org.timezone));
        }
      } catch (err) {
        console.error("Failed to load org currency:", err);
      }
    }
    loadOrgCurrency();
  }, [organizationId]);

  useEffect(() => {
    fetchInitialProducts();
    fetchLocations();
    fetchWorkflowMode();
    fetchCustomers();
    preloadCheckoutDependencies();
  }, []);

  async function preloadCheckoutDependencies() {
    try {
      const cached = await AsyncStorage.getItem("checkout_cache");
      if (cached) {
        checkoutCacheRef.current = JSON.parse(cached);
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || !organizationId) return;

      const { data: devices } = await supabase
        .from("devices")
        .select("id, device_name")
        .eq("organization_id", organizationId)
        .limit(1);

      let deviceId = devices?.[0]?.id;
      let deviceName = devices?.[0]?.device_name || "APP";

      if (!deviceId) {
        const { data: newDevice } = await supabase
          .from("devices")
          .insert({
            organization_id: organizationId,
            device_name: "Mobile App",
          })
          .select("id, device_name")
          .single();
        deviceId = newDevice?.id;
        deviceName = newDevice?.device_name || "APP";
      }

      checkoutCacheRef.current = {
        userId: user.id,
        organizationId,
        deviceId,
        deviceName,
      };

      await AsyncStorage.setItem(
        "checkout_cache",
        JSON.stringify(checkoutCacheRef.current),
      );

      try {
        const org = await getOrganization(organizationId);
        if (org.timezone) setOrgTimezone(org.timezone);
        const orgDetails = { name: org.name || "Your Business" };
        await AsyncStorage.setItem(
          `org_invoice_details_${organizationId}`,
          JSON.stringify(orgDetails),
        );
        const generator = new InvoiceGenerator(organizationId);
        await generator.initialize();
      } catch {}
    } catch (err) {
      console.error("Preload failed (will fetch at checkout):", err);
    }
  }

  async function fetchWorkflowMode() {
    try {
      if (!organizationId) return;
      const { data: settings } = await supabase
        .from("organization_settings")
        .select("workflow_mode")
        .eq("organization_id", organizationId)
        .single();
      setWorkflowMode(settings?.workflow_mode || "solo");
    } catch (err) {
      console.error("Error fetching workflow mode:", err);
    }
  }

  useEffect(() => {
    if (selectedLocation) {
      fetchProductsInStock();
      if (isInitialLoad) setIsInitialLoad(false);
    }
  }, [selectedLocation]);

  function handleLocationChange(location: { id: string; name: string }) {
    if (cart.length === 0 || isInitialLoad) {
      setSelectedLocation(location);
      return;
    }
    setPendingLocation(location);
    Alert.alert(
      "Location Changed",
      "Switching locations will clear your cart.",
      [
        {
          text: "Cancel",
          style: "cancel",
          onPress: () => setPendingLocation(null),
        },
        {
          text: "Clear Cart",
          style: "destructive",
          onPress: () => {
            setCart([]);
            setSelectedLocation(location);
            setPendingLocation(null);
          },
        },
      ],
    );
  }

  async function fetchInitialProducts() {
    try {
      const cachedProducts = await AsyncStorage.getItem("products_cache");
      if (cachedProducts) setProducts(JSON.parse(cachedProducts));

      const cachedBulk = await AsyncStorage.getItem("bulk_prices_cache");
      if (cachedBulk) setBulkPriceMap(new Map(JSON.parse(cachedBulk)));

      const [productsResult, bulkResult] = await Promise.all([
        supabase
          .from("products")
          .select(
            "id, name, unit, category, default_selling_price, product_type, is_sellable",
          )
          .eq("is_active", true)
          .order("name")
          .limit(200),
        supabase
          .from("product_bulk_prices")
          .select("id, product_id, name, quantity_multiplier, unit_price")
          .eq("is_active", true),
      ]);

      if (productsResult.data) {
        setProducts(productsResult.data);
        await AsyncStorage.setItem(
          "products_cache",
          JSON.stringify(productsResult.data),
        );
      }

      if (bulkResult.data) {
        const map = new Map<string, BulkPrice[]>();
        bulkResult.data.forEach((bp) => {
          if (!map.has(bp.product_id)) map.set(bp.product_id, []);
          map.get(bp.product_id)!.push(bp);
        });
        setBulkPriceMap(map);
        await AsyncStorage.setItem(
          "bulk_prices_cache",
          JSON.stringify(Array.from(map.entries())),
        );
      }
    } catch (err) {
      console.error("Products fetch failed, using cache:", err);
    } finally {
      setInitialLoading(false);
    }
  }

  async function fetchCustomers() {
    if (!organizationId) return;
    try {
      // Load cache first — works offline
      const cached = await AsyncStorage.getItem(
        `customers_cache_${organizationId}`,
      );
      if (cached) setCustomers(JSON.parse(cached));

      // Then refresh from network
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, phone")
        .eq("organization_id", organizationId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      if (data) {
        setCustomers(data);
        await AsyncStorage.setItem(
          `customers_cache_${organizationId}`,
          JSON.stringify(data),
        );
      }
    } catch (err) {
      console.warn("fetchCustomers: using cache", err);
    }
  }

  async function fetchProductsInStock() {
    if (!selectedLocation) return;

    try {
      const cacheKey = `stock_cache_${selectedLocation.id}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setProductsInStock(parsed.inStock);
        setInventoryCostMap(new Map(parsed.costMap));
      }

      const { data, error } = await supabase
        .from("inventory")
        .select("product_id, quantity_on_hand, weighted_avg_cost")
        .eq("location_id", selectedLocation.id)
        .gt("quantity_on_hand", 0);

      if (error) throw error;

      const costMap = new Map<string, { cost: number; stock: number }>();
      data?.forEach((item) => {
        costMap.set(item.product_id, {
          cost: item.weighted_avg_cost,
          stock: item.quantity_on_hand,
        });
      });

      const inStock = data?.map((item) => item.product_id) || [];
      setInventoryCostMap(costMap);
      setProductsInStock(inStock);
      await AsyncStorage.setItem(
        cacheKey,
        JSON.stringify({ inStock, costMap: Array.from(costMap.entries()) }),
      );
    } catch (err) {
      console.error("Error fetching products in stock:", err);
    }
  }

  async function fetchLocations() {
    try {
      const cached = await AsyncStorage.getItem("locations_cache");
      if (cached) {
        const parsed = JSON.parse(cached);
        setLocations(parsed);
        setSelectedLocation(parsed[0] ?? null);
      }

      if (!organizationId) return;

      const { data, error } = await supabase
        .from("locations")
        .select("id, name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        setLocations(data);
        setSelectedLocation((prev) => prev ?? data[0]);
        await AsyncStorage.setItem("locations_cache", JSON.stringify(data));
      }
    } catch (err) {
      console.error("Error fetching locations:", err);
    }
  }

  async function fetchProducts() {
    if (products.length > 0) return;
    try {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, unit, category, default_selling_price, product_type, is_sellable",
        )
        .eq("is_active", true)
        .order("name");
      if (!error) setProducts(data || []);
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setInitialLoading(false);
    }
  }

  useEffect(() => {
    if (searchQuery.length >= 2) {
      const timer = setTimeout(() => fetchProducts(), 300);
      return () => clearTimeout(timer);
    }
  }, [searchQuery]);

  async function addToCart(product: Product) {
    const sellingPrice = product.default_selling_price;
    if (!sellingPrice || sellingPrice <= 0) {
      Alert.alert(
        "No Selling Price Set",
        `${product.name} does not have a selling price.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Set Price Now",
            onPress: () =>
              router.push({
                pathname: "/inventory/adjust",
                params: { productId: product.id },
              }),
          },
        ],
      );
      return;
    }

    const bulkTiers = bulkPriceMap.get(product.id) ?? [];
    if (bulkTiers.length > 0) {
      setSelectedProduct(product);
      setProductBulkPrices(bulkTiers);
      setSelectedBulkPrice(null);
      setBulkQuantity("1");
      setShowBulkPriceModal(true);
    } else {
      addToCartDirect(product, sellingPrice);
    }
  }

  function addToCartDirect(product: Product, sellingPrice: number) {
    const inventoryInfo = inventoryCostMap.get(product.id);

    if (!inventoryInfo) {
      Alert.alert(
        "Not in Stock",
        `${product.name} is not available at ${selectedLocation?.name || "this location"}.`,
      );
      return;
    }

    const { cost, stock } = inventoryInfo;
    const existingItem = cart.find((item) => item.product.id === product.id);
    const currentQtyInCart = existingItem?.quantity || 0;

    if (currentQtyInCart >= stock) {
      Alert.alert(
        "Insufficient Stock",
        `Only ${stock} ${product.unit} available. You already have ${currentQtyInCart} in cart.`,
      );
      return;
    }

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item,
        ),
      );
    } else {
      setCart([
        ...cart,
        { product, quantity: 1, unit_price: sellingPrice, unit_cogs: cost },
      ]);
    }

    Toast.show({
      type: "success",
      text1: product.name,
      text2: "Added to cart",
      visibilityTime: 800,
    });
  }

  async function processAddToCart() {
    if (!selectedProduct) return;

    const sellingPrice = selectedBulkPrice
      ? selectedBulkPrice.unit_price
      : selectedProduct.default_selling_price!;
    const multiplier = selectedBulkPrice
      ? selectedBulkPrice.quantity_multiplier
      : 1;
    const quantity = parseFloat(bulkQuantity) || 1;
    const totalUnits = quantity * multiplier;

    setShowBulkPriceModal(false);

    const inventoryInfo = inventoryCostMap.get(selectedProduct.id);
    if (!inventoryInfo) {
      Alert.alert("Error", "Could not get product stock information");
      return;
    }

    const { stock } = inventoryInfo;
    const existingItem = cart.find(
      (item) => item.product.id === selectedProduct.id,
    );
    const currentQty = existingItem?.quantity ?? 0;

    if (currentQty + totalUnits > stock) {
      Alert.alert(
        "Insufficient Stock",
        `Only ${stock} ${selectedProduct.unit} available. You have ${currentQty} in cart.`,
      );
      return;
    }

    if (existingItem) {
      setCart(
        cart.map((item) =>
          item.product.id === selectedProduct.id
            ? {
                ...item,
                quantity: item.quantity + totalUnits,
                unit_price: sellingPrice,
              }
            : item,
        ),
      );
    } else {
      setCart([
        ...cart,
        {
          product: selectedProduct,
          quantity: totalUnits,
          unit_price: sellingPrice,
          unit_cogs: inventoryInfo.cost,
        },
      ]);
    }

    Toast.show({
      type: "success",
      text1: selectedProduct.name,
      text2: `${totalUnits} ${selectedProduct.unit} added`,
      visibilityTime: 800,
    });
  }

  function removeFromCart(productId: string) {
    setCart(cart.filter((item) => item.product.id !== productId));
  }

  async function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart(cart.filter((item) => item.product.id !== productId));
      return;
    }

    const inventoryInfo = inventoryCostMap.get(productId);
    if (inventoryInfo && quantity > inventoryInfo.stock) {
      const product = products.find((p) => p.id === productId);
      Alert.alert(
        "Insufficient Stock",
        `Only ${inventoryInfo.stock} ${product?.unit || "units"} available.`,
      );
      return;
    }

    setCart(
      cart.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item,
      ),
    );
  }

  function updatePrice(productId: string, price: number) {
    setCart(
      cart.map((item) =>
        item.product.id === productId ? { ...item, unit_price: price } : item,
      ),
    );
  }

  const subtotal = cart.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  );
  const discountAmount =
    discountType === "fixed" ? discount : (subtotal * discount) / 100;
  const totalAfterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = (totalAfterDiscount * taxRate) / 100;
  const finalTotal = totalAfterDiscount + taxAmount;
  const totalCogs = cart.reduce(
    (sum, item) => sum + item.quantity * item.unit_cogs,
    0,
  );

  async function handleCheckout() {
    if (cart.length === 0) {
      Alert.alert("Empty Cart", "Please add items to cart");
      return;
    }
    if (!selectedLocation) {
      Alert.alert(
        "Select Location",
        "Please select a location before checkout",
      );
      return;
    }
    setPrePaymentAmount(finalTotal.toFixed(2));
    setShowPrePaymentModal(true);
  }

  async function handleCheckoutWithPayment(
    method: "cash" | "bank" | "pos" | "mobile" | "unpaid",
  ) {
    const parsedAmount = parseFloat(prePaymentAmount);
    if (method !== "unpaid" && (!parsedAmount || parsedAmount <= 0)) {
      Alert.alert("Invalid Amount", "Please enter a valid payment amount");
      return;
    }
    setShowPrePaymentModal(false);
    setLoading(true);
    try {
      await handleSimpleCheckoutWithMethod(method, parsedAmount);
    } catch (err: any) {
      console.error("Sale creation error:", err);
      let errorMessage = "Failed to create sale";
      if (err.code === "42501")
        errorMessage =
          "Permission denied. Please check your account permissions.";
      else if (err.message?.includes("insufficient"))
        errorMessage = "Insufficient stock for one or more items";
      else if (err.message) errorMessage = err.message;
      Alert.alert("Error", errorMessage);
    } finally {
      setLoading(false);
    }
  }

  async function handleSimpleCheckoutWithMethod(
    method: "cash" | "bank" | "pos" | "mobile" | "unpaid",
    paymentAmount: number = finalTotal,
  ) {
    const storeOrgId = organizationId;
    try {
      let userId: string;
      let organizationId: string;
      let deviceId: string;
      let deviceName: string;

      if (checkoutCacheRef.current) {
        ({ userId, organizationId, deviceId, deviceName } =
          checkoutCacheRef.current);
      } else {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Not authenticated");
        if (!storeOrgId) throw new Error("Organization not found");

        const { data: devices } = await supabase
          .from("devices")
          .select("id, device_name")
          .eq("organization_id", storeOrgId)
          .limit(1);
        deviceId = devices?.[0]?.id;
        deviceName = devices?.[0]?.device_name || "APP";
        userId = user.id;
        organizationId = storeOrgId;

        if (!deviceId) {
          const { data: newDevice } = await supabase
            .from("devices")
            .insert({ organization_id: storeOrgId, device_name: "Mobile App" }) // ← CHANGE
            .select("id, device_name")
            .single();
          deviceId = newDevice?.id;
          deviceName = newDevice?.device_name || "APP";
        }
        checkoutCacheRef.current = {
          userId,
          organizationId,
          deviceId,
          deviceName,
        };
      }

      const locationId = selectedLocation!.id;
      const locationName = selectedLocation!.name;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const shortUuid = Crypto.randomUUID().split("-")[0].toUpperCase();
      const sequenceKey = `device-${deviceId}-sequence-${dateStr}`;
      let sequence = Number(await AsyncStorage.getItem(sequenceKey)) || 0;
      sequence += 1;
      await AsyncStorage.setItem(sequenceKey, sequence.toString());
      const locationCode = (locationName || "LOC")
        .substring(0, 3)
        .toUpperCase()
        .padEnd(3, "X");
      const deviceCode = (deviceName || "APP")
        .substring(0, 3)
        .toUpperCase()
        .padEnd(3, "X");
      const receiptNumber = `${locationCode}-${dateStr}-${deviceCode}-${sequence.toString().padStart(4, "0")}-${shortUuid}`;
      const localId = Crypto.randomUUID();

      const isPaymentProvided = method !== "unpaid" && paymentAmount > 0;
      const isFullyPaid = isPaymentProvided && paymentAmount >= finalTotal;

      const salePayload = {
        receipt_number: receiptNumber,
        organization_id: organizationId,
        location_id: locationId,
        device_id: deviceId,
        customer_id: selectedCustomer?.id || null,
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        total_amount: finalTotal,
        total_cogs: totalCogs,
        payment_status: isFullyPaid
          ? "paid"
          : isPaymentProvided
            ? "partial"
            : "unpaid",
        created_by: userId,
        occurred_at: transactionDate.toISOString(),
        created_at: new Date().toISOString(),
        is_backdated: isBackdated,
        entry_method: "mobile_app",
        device_info: JSON.stringify({
          platform: Platform.OS,
          version: Platform.Version,
        }),
      };

      const itemsPayload = cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cogs: item.unit_cogs,
        total_cogs: item.quantity * item.unit_cogs,
      }));

      const mutationsPayload = cart.map((item) => ({
        p_product_id: item.product.id,
        p_location_id: locationId,
        p_direction: "out",
        p_quantity: item.quantity,
        p_unit_cost: item.unit_cogs,
        p_source_type: "sale",
        p_device_id: deviceId,
      }));

      const paymentPayload = isPaymentProvided
        ? {
            organization_id: organizationId,
            location_id: locationId,
            reference_type: "sale",
            amount: paymentAmount,
            payment_method: method,
            direction: "in",
            device_id: deviceId,
            created_by: userId,
            occurred_at: new Date().toISOString(),
            payment_delay_minutes: 0,
            is_immediate: true,
            idempotency_key: `${localId}-${method}-${paymentAmount}`,
          }
        : null;

      await queueSale({
        localId,
        receiptNumber,
        salePayload,
        items: itemsPayload,
        payment: paymentPayload,
        inventoryMutations: mutationsPayload,
      });

      const updatedCostMap = new Map(inventoryCostMap);
      cart.forEach((item) => {
        const existing = updatedCostMap.get(item.product.id);
        if (existing) {
          const newStock = existing.stock - item.quantity;
          if (newStock <= 0) updatedCostMap.delete(item.product.id);
          else
            updatedCostMap.set(item.product.id, {
              ...existing,
              stock: newStock,
            });
        }
      });
      setInventoryCostMap(updatedCostMap);
      setProductsInStock(Array.from(updatedCostMap.keys()));
      setCompletedCartSnapshot([...cart]);
      setCart([]);
      setSelectedCustomer(null);
      setCustomerName("");

      completedSaleRef.current = {
        id: localId,
        receiptNumber,
        totalAmount: finalTotal,
        customerId: selectedCustomer?.id,
        paymentStatus: isFullyPaid
          ? "paid"
          : isPaymentProvided
            ? "partial"
            : "unpaid",
        amountPaid: isPaymentProvided ? paymentAmount : 0,
        paymentMethod: isPaymentProvided ? method : undefined,
      };
      setCompletedSale(completedSaleRef.current);
      setShowReceiptShare(true);
      setShowReceiptShare(true);

      Toast.show({
        type: "success",
        text1: isFullyPaid
          ? `✓ Paid — ${receiptNumber}`
          : isPaymentProvided
            ? `◐ Partial — ${receiptNumber}`
            : "Order recorded",
        text2: isFullyPaid
          ? `${currency.symbol}${paymentAmount.toFixed(2)} · ${method}`
          : isPaymentProvided
            ? `${currency.symbol}${paymentAmount.toFixed(2)} of ${currency.symbol}${finalTotal.toFixed(2)} · ${method}`
            : `${receiptNumber} · Unpaid`,
        visibilityTime: 1800,
      });

      const netState = await NetInfo.fetch();
      if (netState.isConnected) syncOutbox();
    } catch (err: any) {
      console.error("Checkout with method error:", err);
      throw err;
    }
  }

  async function handleQuickCheckout() {
    if (cart.length === 0) return;
    if (!selectedLocation) {
      Alert.alert(
        "Select Location",
        "Please select a location before checkout",
      );
      return;
    }

    setLoading(true);
    try {
      let userId: string = "";
      let organizationId: string = "";
      let deviceId: string = "";
      let deviceName: string = "";

      if (checkoutCacheRef.current) {
        ({ userId, organizationId, deviceId, deviceName } =
          checkoutCacheRef.current);
      } else {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        if (!organizationId) throw new Error("Organization not found"); // ← reads from store

        userId = user.id;

        const { data: devices } = await supabase
          .from("devices")
          .select("id, device_name")
          .eq("organization_id", organizationId)
          .limit(1);

        deviceId = devices?.[0]?.id ?? "";
        deviceName = devices?.[0]?.device_name ?? "APP";

        if (!deviceId) {
          const { data: newDevice } = await supabase
            .from("devices")
            .insert({
              organization_id: organizationId,
              device_name: "Mobile App",
            })
            .select("id, device_name")
            .single();
          deviceId = newDevice?.id ?? "";
          deviceName = newDevice?.device_name ?? "APP";
        }

        checkoutCacheRef.current = {
          userId,
          organizationId,
          deviceId,
          deviceName,
        };
        await AsyncStorage.setItem(
          "checkout_cache",
          JSON.stringify(checkoutCacheRef.current),
        );
      }

      if (!userId || !organizationId || !deviceId) {
        throw new Error(
          "Missing required data — please ensure you have logged in with a network connection at least once.",
        );
      }

      const locationId = selectedLocation.id;
      const locationName = selectedLocation.name;
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const shortUuid = Crypto.randomUUID().split("-")[0].toUpperCase();
      const sequenceKey = `device-${deviceId}-sequence-${dateStr}`;
      let sequence = Number(await AsyncStorage.getItem(sequenceKey)) || 0;
      sequence += 1;
      await AsyncStorage.setItem(sequenceKey, sequence.toString());

      const locationCode = (locationName || "LOC")
        .substring(0, 3)
        .toUpperCase()
        .padEnd(3, "X");
      const deviceCode = (deviceName || "APP")
        .substring(0, 3)
        .toUpperCase()
        .padEnd(3, "X");
      const receiptNumber = `${locationCode}-${dateStr}-${deviceCode}-${sequence.toString().padStart(4, "0")}-${shortUuid}`;
      const localId = Crypto.randomUUID();

      const salePayload = {
        receipt_number: receiptNumber,
        organization_id: organizationId,
        location_id: locationId,
        device_id: deviceId,
        customer_id: selectedCustomer?.id || null,
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        total_amount: finalTotal,
        total_cogs: totalCogs,
        payment_status: "paid",
        created_by: userId,
        occurred_at: transactionDate.toISOString(),
        created_at: new Date().toISOString(),
        is_backdated: isBackdated,
        entry_method: "mobile_app",
        device_info: JSON.stringify({
          platform: Platform.OS,
          version: Platform.Version,
        }),
      };

      const itemsPayload = cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_cogs: item.unit_cogs,
        total_cogs: item.quantity * item.unit_cogs,
      }));

      const mutationsPayload = cart.map((item) => ({
        p_product_id: item.product.id,
        p_location_id: locationId,
        p_direction: "out",
        p_quantity: item.quantity,
        p_unit_cost: item.unit_cogs,
        p_source_type: "sale",
        p_device_id: deviceId,
      }));

      const paymentPayload = {
        organization_id: organizationId,
        location_id: locationId,
        reference_type: "sale",
        amount: finalTotal,
        payment_method: "cash",
        direction: "in",
        device_id: deviceId,
        created_by: userId,
        occurred_at: new Date().toISOString(),
        payment_delay_minutes: 0,
        is_immediate: true,
        idempotency_key: `${localId}-cash-${finalTotal}`,
      };

      await queueSale({
        localId,
        receiptNumber,
        salePayload,
        items: itemsPayload,
        payment: paymentPayload,
        inventoryMutations: mutationsPayload,
      });

      const updatedCostMap = new Map(inventoryCostMap);
      cart.forEach((item) => {
        const existing = updatedCostMap.get(item.product.id);
        if (existing) {
          const newStock = existing.stock - item.quantity;
          if (newStock <= 0) updatedCostMap.delete(item.product.id);
          else
            updatedCostMap.set(item.product.id, {
              ...existing,
              stock: newStock,
            });
        }
      });
      setInventoryCostMap(updatedCostMap);
      setProductsInStock(Array.from(updatedCostMap.keys()));
      setCompletedCartSnapshot([...cart]);
      setCart([]);
      setSelectedCustomer(null);

      completedSaleRef.current = {
        id: localId,
        receiptNumber,
        totalAmount: finalTotal,
        customerId: selectedCustomer?.id,
        paymentStatus: "paid",
        amountPaid: finalTotal,
        paymentMethod: "cash",
      };
      setCompletedSale(completedSaleRef.current);
      setShowReceiptShare(true);

      Toast.show({
        type: "success",
        text1: "✓ Paid — " + receiptNumber,
        text2: `${currency.symbol}${finalTotal.toFixed(2)} cash`,
        visibilityTime: 2000,
      });

      const netState = await NetInfo.fetch();
      if (netState.isConnected) syncOutbox();
    } catch (err: any) {
      console.error("Quick checkout error:", err);
      Alert.alert("Error", err.message || "Failed to complete sale");
    } finally {
      setLoading(false);
    }
  }

  const filteredProducts = products
    .filter((product) => {
      const isSellable =
        product.product_type === "product" || product.is_sellable === true;
      if (!isSellable) return false;
      if (!product.name.toLowerCase().includes(searchQuery.toLowerCase()))
        return false;
      if (selectedLocation && !productsInStock.includes(product.id))
        return false;
      return true;
    })
    .slice(0, 10);

  if (permissionsLoading || initialLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.canvas,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator size="large" color={c.brandInteractive} />
      </View>
    );
  }

  if (!hasPermission("sales.create")) return null;

  async function getSaleReceiptData(
    sale: NonNullable<typeof completedSale>,
  ): Promise<{
    invoiceData: InvoiceData;
    org: { name: string };
  } | null> {
    if (!organizationId) return null;
    try {
      let org: { name: string };
      const cached = await AsyncStorage.getItem(
        `org_invoice_details_${organizationId}`,
      );
      if (cached) {
        org = JSON.parse(cached);
      } else {
        const orgData = await getOrganization(organizationId);
        org = { name: orgData.name || "Your Business" };
        await AsyncStorage.setItem(
          `org_invoice_details_${organizationId}`,
          JSON.stringify(org),
        );
      }

      const invoiceData: InvoiceData = {
        type: "sale_receipt",
        number: sale.receiptNumber,
        date: new Date(),
        organizationId,
        customer: selectedCustomer
          ? {
              id: selectedCustomer.id,
              name: selectedCustomer.name,
              email: selectedCustomer.email,
              phone: selectedCustomer.phone,
            }
          : undefined,
        location: selectedLocation
          ? { id: selectedLocation.id, name: selectedLocation.name }
          : undefined,
        items: completedCartSnapshot.map((item) => ({
          productName: item.product.name,
          quantity: item.quantity,
          unit: item.product.unit,
          unitPrice: item.unit_price,
          total: item.quantity * item.unit_price,
        })),
        subtotal,
        discount: discountAmount > 0 ? discountAmount : undefined,
        tax: taxAmount > 0 ? taxAmount : undefined,
        totalAmount: sale.totalAmount,
        amountPaid:
          sale.paymentStatus === "paid"
            ? sale.totalAmount
            : sale.paymentStatus === "partial"
              ? parseFloat(prePaymentAmount) || 0
              : 0,
        paymentMethod:
          sale.paymentStatus === "paid" || sale.paymentStatus === "partial"
            ? "Cash"
            : undefined,
      };

      return { invoiceData, org };
    } catch (err) {
      console.error("getSaleReceiptData failed:", err);
      return null;
    }
  }

  async function generateSaleReceipt(): Promise<string | null> {
    if (!completedSale || !organizationId) return null;
    try {
      const result = await getSaleReceiptData(completedSale);
      if (!result) return null;
      const generator = new InvoiceGenerator(organizationId);
      await generator.initialize();
      const html = generator.buildHTML(result.invoiceData);
      const Print = await import("expo-print");
      const { uri } = await Print.printToFileAsync({ html });
      return uri;
    } catch (err) {
      console.error("generateSaleReceipt failed:", err);
      return null;
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.canvas }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingTop: insets.top + sp.md,
          paddingHorizontal: sp.lg,
          paddingBottom: sp.md,
          backgroundColor: c.canvas,
          borderBottomWidth: 1,
          borderBottomColor: c.borderSubtle,
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: c.surfaceRaised,
            borderWidth: 1,
            borderColor: c.borderSubtle,
            alignItems: "center",
            justifyContent: "center",
            marginRight: sp.md,
          }}
        >
          <Feather name="chevron-left" size={20} color={c.textSecondary} />
        </TouchableOpacity>
        <Text
          style={{
            flex: 1,
            color: c.textPrimary,
            fontFamily: t.h2.fontFamily,
            fontSize: 18,
            lineHeight: 22,
          }}
        >
          New Sale
        </Text>
        <TouchableOpacity
          onPress={() => router.push("/settings")}
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: c.surfaceRaised,
            borderWidth: 1,
            borderColor: c.borderSubtle,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Feather name="settings" size={16} color={c.textSecondary} />
        </TouchableOpacity>
      </View>

      {!isBackdated && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: sp.lg,
            paddingVertical: sp.sm,
            backgroundColor: c.positiveSoft,
            borderBottomWidth: 1,
            borderBottomColor: c.positive + "44",
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 999,
              backgroundColor: c.positive,
              marginRight: sp.sm,
            }}
          />
          <Text
            style={{
              color: c.positive,
              fontFamily: t.monoSm.fontFamily,
              fontSize: 11,
              letterSpacing: 0.3,
            }}
          >
            {"LIVE  ·  "}
            {new Date().toLocaleTimeString(undefined, {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
              ...(orgTimezone ? { timeZone: orgTimezone } : {}),
            })}
          </Text>
        </View>
      )}

      {isBackdated && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: sp.lg,
            paddingVertical: sp.sm,
            backgroundColor: c.warningSoft,
            borderBottomWidth: 1,
            borderBottomColor: c.signalDim,
          }}
        >
          <Feather
            name="alert-triangle"
            size={12}
            color={c.signal}
            style={{ marginRight: 6 }}
          />
          <Text
            style={{
              color: c.signal,
              fontFamily: t.monoSm.fontFamily,
              fontSize: 11,
              letterSpacing: 0.3,
            }}
          >
            BACKDATED · {transactionDate.toLocaleDateString()}
          </Text>
        </View>
      )}

      <View style={{ flex: 1, flexDirection: "row" }}>
        {/* Products Section */}
        <View style={{ flex: 1, padding: sp.lg }}>
          {/* Location selector — RLS ensures only accessible locations appear */}
          <View style={{ marginBottom: sp.md }}>
            <Text
              style={{
                fontSize: 9,
                letterSpacing: 1,
                color: c.textMuted,
                fontFamily: t.labelSm.fontFamily,
                marginBottom: sp.sm,
              }}
            >
              {locations.length > 1 ? "SELLING FROM" : "LOCATION"}
            </Text>
            {locations.length === 0 ? (
              <View
                style={{
                  padding: sp.md,
                  backgroundColor: c.warningSoft,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: c.signalDim,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: c.signal,
                    fontFamily: t.bodySm.fontFamily,
                  }}
                >
                  No locations found. Add a location in Settings first.
                </Text>
              </View>
            ) : locations.length === 1 ? (
              <View
                style={{
                  padding: sp.md,
                  backgroundColor: c.surfaceRaised,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Feather name="map-pin" size={12} color={c.textMuted} />
                <Text
                  style={{
                    fontSize: 12,
                    color: c.textPrimary,
                    fontFamily: t.bodyMed.fontFamily,
                  }}
                >
                  {selectedLocation?.name}
                </Text>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: sp.sm }}
              >
                {locations.map((location) => (
                  <TouchableOpacity
                    key={location.id}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 7,
                      borderRadius: 999,
                      backgroundColor:
                        selectedLocation?.id === location.id
                          ? c.brandInteractive
                          : c.surfaceRaised,
                      borderWidth: 1,
                      borderColor:
                        selectedLocation?.id === location.id
                          ? c.brandInteractive
                          : c.borderSubtle,
                    }}
                    onPress={() => handleLocationChange(location)}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontFamily:
                          selectedLocation?.id === location.id
                            ? t.bodyMed.fontFamily
                            : t.bodySm.fontFamily,
                        color:
                          selectedLocation?.id === location.id
                            ? c.air
                            : c.textSecondary,
                      }}
                    >
                      {location.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>

          <View
            style={{
              backgroundColor: c.surfaceRaised,
              borderWidth: 1,
              borderColor: c.borderSubtle,
              borderRadius: 8,
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: sp.md,
              marginBottom: sp.md,
            }}
          >
            <Feather
              name="search"
              size={14}
              color={c.textMuted}
              style={{ marginRight: sp.sm }}
            />
            <TextInput
              style={{
                flex: 1,
                paddingVertical: sp.md,
                color: c.textPrimary,
                fontFamily: t.body.fontFamily,
                fontSize: 13,
              }}
              placeholder="Search products..."
              placeholderTextColor={c.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <Feather name="x" size={14} color={c.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
            {searchQuery.length > 0 && filteredProducts.length === 0 && (
              <Text
                style={{
                  textAlign: "center",
                  marginTop: 32,
                  fontSize: 12,
                  color: c.textMuted,
                  fontFamily: t.monoSm.fontFamily,
                }}
              >
                No products found
              </Text>
            )}
            {filteredProducts.map((product) => (
              <TouchableOpacity
                key={product.id}
                style={{
                  backgroundColor: c.surfaceRaised,
                  padding: sp.md,
                  borderRadius: 8,
                  marginBottom: sp.sm,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                }}
                onPress={() => addToCart(product)}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 13,
                      color: c.textPrimary,
                      fontFamily: t.bodyMed.fontFamily,
                      marginBottom: 2,
                    }}
                  >
                    {product.name}
                  </Text>
                  <Text
                    style={{
                      fontSize: 10,
                      color: c.textMuted,
                      fontFamily: t.monoSm.fontFamily,
                      letterSpacing: 0.2,
                    }}
                  >
                    {product.category || "Uncategorized"}
                  </Text>
                </View>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 6,
                    backgroundColor: c.brandInteractive,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Feather name="plus" size={14} color={c.air} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Cart Section */}
        <View
          style={{
            flex: 1,
            maxWidth: 450,
            backgroundColor: c.surface,
            borderLeftWidth: 1,
            borderLeftColor: c.borderSubtle,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <View
            style={{
              paddingHorizontal: sp.lg,
              paddingVertical: sp.md,
              borderBottomWidth: 1,
              borderBottomColor: c.borderSubtle,
            }}
          >
            <Text
              style={{
                fontSize: 9,
                letterSpacing: 1,
                color: c.textMuted,
                fontFamily: t.labelSm.fontFamily,
                marginBottom: sp.sm,
              }}
            >
              CUSTOMER
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: sp.sm }}
            >
              <TouchableOpacity
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: !selectedCustomer
                    ? c.brandInteractive
                    : c.surfaceRaised,
                  borderWidth: 1,
                  borderColor: !selectedCustomer
                    ? c.brandInteractive
                    : c.borderSubtle,
                }}
                onPress={() => setSelectedCustomer(null)}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontFamily: !selectedCustomer
                      ? t.bodyMed.fontFamily
                      : t.bodySm.fontFamily,
                    color: !selectedCustomer ? c.air : c.textSecondary,
                  }}
                >
                  Walk-in
                </Text>
              </TouchableOpacity>
              {customers.map((customer) => (
                <TouchableOpacity
                  key={customer.id}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor:
                      selectedCustomer?.id === customer.id
                        ? c.brandInteractive
                        : c.surfaceRaised,
                    borderWidth: 1,
                    borderColor:
                      selectedCustomer?.id === customer.id
                        ? c.brandInteractive
                        : c.borderSubtle,
                  }}
                  onPress={() => setSelectedCustomer(customer)}
                >
                  <Text
                    style={{
                      fontSize: 11,
                      fontFamily:
                        selectedCustomer?.id === customer.id
                          ? t.bodyMed.fontFamily
                          : t.bodySm.fontFamily,
                      color:
                        selectedCustomer?.id === customer.id
                          ? c.air
                          : c.textSecondary,
                    }}
                  >
                    {customer.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <Text
            style={{
              fontSize: 9,
              letterSpacing: 1,
              color: c.textMuted,
              fontFamily: t.labelSm.fontFamily,
              paddingHorizontal: sp.lg,
              paddingTop: sp.md,
              paddingBottom: sp.sm,
            }}
          >
            CART · {cart.length} {cart.length === 1 ? "ITEM" : "ITEMS"}
          </Text>

          <ScrollView style={{ flex: 1, paddingHorizontal: sp.lg }}>
            {cart.map((item, index) => (
              <View
                key={`${item.product.id}-${index}`}
                style={{
                  backgroundColor: c.surfaceRaised,
                  padding: sp.md,
                  borderRadius: 8,
                  marginBottom: sp.sm,
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: sp.sm,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        color: c.textPrimary,
                        fontFamily: t.bodyMed.fontFamily,
                      }}
                    >
                      {item.product.name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => removeFromCart(item.product.id)}
                    style={{ padding: 2 }}
                  >
                    <Feather name="x" size={14} color={c.textMuted} />
                  </TouchableOpacity>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: sp.sm,
                  }}
                >
                  {/* Qty controls */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      backgroundColor: c.surface,
                      borderRadius: 6,
                      padding: 3,
                    }}
                  >
                    <TouchableOpacity
                      onPress={() =>
                        updateQuantity(item.product.id, item.quantity - 1)
                      }
                      style={{
                        width: 26,
                        height: 26,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Feather name="minus" size={12} color={c.textSecondary} />
                    </TouchableOpacity>
                    {editingQtyFor?.productId === item.product.id ? (
                      <TextInput
                        style={{
                          minWidth: 36,
                          textAlign: "center",
                          fontSize: 13,
                          color: c.textPrimary,
                          fontFamily: t.mono.fontFamily,
                          paddingVertical: 2,
                          borderBottomWidth: 1,
                          borderBottomColor: c.borderDefault,
                        }}
                        value={String(item.quantity)}
                        keyboardType="numeric"
                        autoFocus
                        onChangeText={(text) =>
                          updateQuantity(
                            item.product.id,
                            Math.max(0, parseInt(text, 10) || 0),
                          )
                        }
                        onBlur={() => setEditingQtyFor(null)}
                      />
                    ) : (
                      <TouchableOpacity
                        onPress={() =>
                          setEditingQtyFor({ productId: item.product.id })
                        }
                      >
                        <Text
                          style={{
                            fontSize: 13,
                            fontFamily: t.mono.fontFamily,
                            color: c.textPrimary,
                            marginHorizontal: sp.sm,
                            minWidth: 24,
                            textAlign: "center",
                          }}
                        >
                          {item.quantity}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() =>
                        updateQuantity(item.product.id, item.quantity + 1)
                      }
                      style={{
                        width: 26,
                        height: 26,
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Feather name="plus" size={12} color={c.textSecondary} />
                    </TouchableOpacity>
                  </View>

                  {/* Price control */}
                  {editingPriceFor === item.product.id ? (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: c.surface,
                        borderRadius: 6,
                        paddingHorizontal: sp.sm,
                        paddingVertical: 5,
                        borderWidth: 1,
                        borderColor: c.brandInteractive,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: c.textMuted,
                          fontFamily: t.monoSm.fontFamily,
                          marginRight: 2,
                        }}
                      >
                        {currency.symbol}
                      </Text>
                      <TextInput
                        style={{
                          fontSize: 13,
                          width: 64,
                          color: c.textPrimary,
                          fontFamily: t.mono.fontFamily,
                          padding: 0,
                        }}
                        value={item.unit_price.toString()}
                        onChangeText={(text) =>
                          updatePrice(item.product.id, parseFloat(text) || 0)
                        }
                        keyboardType="numeric"
                        autoFocus
                        onBlur={() => setEditingPriceFor(null)}
                      />
                      <TouchableOpacity
                        onPress={() => setEditingPriceFor(null)}
                        style={{ marginLeft: 4 }}
                      >
                        <Feather name="check" size={13} color={c.positive} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: c.surface,
                        borderRadius: 6,
                        paddingHorizontal: sp.sm,
                        paddingVertical: 5,
                        borderWidth: 1,
                        borderColor: c.borderSubtle,
                      }}
                      onPress={() => setEditingPriceFor(item.product.id)}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          color: c.textMuted,
                          fontFamily: t.monoSm.fontFamily,
                          marginRight: 2,
                        }}
                      >
                        {currency.symbol}
                      </Text>
                      <Text
                        style={{
                          fontSize: 13,
                          color: c.textPrimary,
                          fontFamily: t.mono.fontFamily,
                        }}
                      >
                        {item.unit_price.toFixed(2)}
                      </Text>
                      <Feather
                        name="edit-2"
                        size={10}
                        color={c.brandInteractive}
                        style={{ marginLeft: 4 }}
                      />
                    </TouchableOpacity>
                  )}

                  {/* Line total */}
                  <Text
                    style={{
                      fontSize: 13,
                      color: c.signal,
                      fontFamily: t.mono.fontFamily,
                      minWidth: 72,
                      textAlign: "right",
                    }}
                  >
                    {currency.symbol}
                    {(item.quantity * item.unit_price).toFixed(2)}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Backdating Toggle */}
          <TouchableOpacity
            style={{
              marginBottom: sp.sm,
              padding: sp.md,
              backgroundColor: c.surfaceRaised,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: c.borderSubtle,
            }}
            onPress={() => setIsBackdated(!isBackdated)}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  color: c.textSecondary,
                  fontFamily: t.bodySm.fontFamily,
                }}
              >
                Record past transaction?
              </Text>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 999,
                  backgroundColor: isBackdated ? c.signal : c.surfaceOverlay,
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    letterSpacing: 0.5,
                    color: isBackdated ? c.canvas : c.textMuted,
                    fontFamily: t.labelSm.fontFamily,
                  }}
                >
                  {isBackdated ? "ON" : "OFF"}
                </Text>
              </View>
            </View>
          </TouchableOpacity>

          {isBackdated && (
            <View
              style={{
                marginBottom: sp.sm,
                padding: sp.md,
                backgroundColor: c.warningSoft,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: c.signalDim,
              }}
            >
              <TouchableOpacity
                onPress={() => setShowDatePicker(true)}
                style={{
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.borderDefault,
                  borderRadius: 8,
                  padding: sp.md,
                  marginTop: sp.sm,
                  marginBottom: 4,
                }}
              >
                <Text
                  style={{
                    color: c.textPrimary,
                    fontFamily: t.mono.fontFamily,
                    fontSize: 13,
                  }}
                >
                  {transactionDate.toDateString()}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={transactionDate}
                  mode="date"
                  onChange={(event, selectedDate) => {
                    setShowDatePicker(false);
                    if (selectedDate) setTransactionDate(selectedDate);
                  }}
                />
              )}
            </View>
          )}

          {/* Cart Footer */}
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: c.borderSubtle,
              padding: sp.lg,
              backgroundColor: c.surface,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: sp.sm,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: c.textSecondary,
                  fontFamily: t.bodySm.fontFamily,
                }}
              >
                Subtotal
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: c.textPrimary,
                  fontFamily: t.mono.fontFamily,
                }}
              >
                {currency.symbol}
                {subtotal.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: sp.sm,
              }}
              onPress={() => setShowDiscountModal(true)}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: c.textSecondary,
                  fontFamily: t.bodySm.fontFamily,
                }}
              >
                Discount
                {discount > 0
                  ? ` (${discountType === "fixed" ? currency.symbol : ""}${discount}${discountType === "percent" ? "%" : ""})`
                  : ""}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: discount > 0 ? c.negative : c.brandInteractive,
                  fontFamily: t.mono.fontFamily,
                }}
              >
                {discount > 0
                  ? `-${currency.symbol}${discountAmount.toFixed(2)}`
                  : "+ Add"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: sp.sm,
              }}
              onPress={() => setShowTaxModal(true)}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: c.textSecondary,
                  fontFamily: t.bodySm.fontFamily,
                }}
              >
                Tax{taxRate > 0 ? ` (${taxRate}%)` : ""}
              </Text>
              <Text
                style={{
                  fontSize: 12,
                  color: taxRate > 0 ? c.textPrimary : c.brandInteractive,
                  fontFamily: t.mono.fontFamily,
                }}
              >
                {taxRate > 0
                  ? `${currency.symbol}${taxAmount.toFixed(2)}`
                  : "+ Add"}
              </Text>
            </TouchableOpacity>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: sp.sm,
                paddingTop: sp.md,
                borderTopWidth: 1,
                borderTopColor: c.borderSubtle,
              }}
            >
              <Text
                style={{
                  fontSize: 14,
                  color: c.textPrimary,
                  fontFamily: t.bodyMed.fontFamily,
                }}
              >
                Total
              </Text>
              <Text
                style={{
                  fontSize: 22,
                  color: c.signal,
                  fontFamily: t.monoLg.fontFamily,
                  letterSpacing: -0.5,
                }}
              >
                {currency.symbol}
                {finalTotal.toFixed(2)}
              </Text>
            </View>

            <View
              style={{ flexDirection: "row", gap: sp.sm, marginTop: sp.md }}
            >
              {workflowMode === "team" ? (
                <TouchableOpacity
                  style={{
                    flex: 1,
                    backgroundColor: c.brandInteractive,
                    padding: sp.lg,
                    borderRadius: 8,
                    alignItems: "center",
                    opacity: loading || cart.length === 0 ? 0.5 : 1,
                  }}
                  onPress={async () => {
                    if (cart.length === 0) return;
                    if (!selectedLocation) {
                      Alert.alert(
                        "Select Location",
                        "Please select a location before checkout",
                      );
                      return;
                    }
                    setLoading(true);
                    try {
                      await handleSimpleCheckoutWithMethod("unpaid", 0);
                    } catch (err: any) {
                      Alert.alert(
                        "Error",
                        err.message || "Failed to create sale",
                      );
                    } finally {
                      setLoading(false);
                    }
                  }}
                  disabled={loading || cart.length === 0}
                >
                  {loading ? (
                    <ActivityIndicator color={c.air} size="small" />
                  ) : (
                    <Text
                      style={{
                        color: c.air,
                        fontFamily: t.bodyMed.fontFamily,
                        fontSize: 14,
                      }}
                    >
                      Checkout
                    </Text>
                  )}
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: c.surfaceRaised,
                      padding: sp.lg,
                      borderRadius: 8,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: c.borderDefault,
                      opacity: loading || cart.length === 0 ? 0.5 : 1,
                    }}
                    onPress={handleCheckout}
                    disabled={loading || cart.length === 0}
                  >
                    {loading ? (
                      <ActivityIndicator color={c.textSecondary} size="small" />
                    ) : (
                      <Text
                        style={{
                          color: c.textSecondary,
                          fontFamily: t.bodyMed.fontFamily,
                          fontSize: 14,
                        }}
                      >
                        Other
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{
                      flex: 1.5,
                      backgroundColor: c.brandInteractive,
                      padding: sp.lg,
                      borderRadius: 8,
                      alignItems: "center",
                      opacity: loading || cart.length === 0 ? 0.5 : 1,
                    }}
                    onPress={handleQuickCheckout}
                    disabled={loading || cart.length === 0}
                  >
                    {loading ? (
                      <ActivityIndicator color={c.air} size="small" />
                    ) : (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <Feather name="zap" size={14} color={c.air} />
                        <Text
                          style={{
                            color: c.air,
                            fontFamily: t.bodyMed.fontFamily,
                            fontSize: 14,
                          }}
                        >
                          Quick Cash
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* Payment Modal */}
      <Modal
        visible={showPrePaymentModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPrePaymentModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: c.surfaceRaised,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: sp.xl,
              paddingBottom: 40,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 999,
                backgroundColor: c.borderDefault,
                alignSelf: "center",
                marginBottom: sp.xl,
              }}
            />
            <Text
              style={{
                color: c.textPrimary,
                fontFamily: t.h2.fontFamily,
                fontSize: 20,
                marginBottom: 4,
              }}
            >
              How are they paying?
            </Text>
            <Text
              style={{
                color: c.textMuted,
                fontFamily: t.monoSm.fontFamily,
                fontSize: 10,
                letterSpacing: 0.3,
                marginBottom: sp.xl,
              }}
            >
              TOTAL · {currency.symbol}
              {finalTotal.toFixed(2)}
            </Text>

            <Text
              style={{
                fontSize: 9,
                letterSpacing: 1,
                color: c.textMuted,
                fontFamily: t.labelSm.fontFamily,
                marginBottom: sp.md,
              }}
            >
              AMOUNT RECEIVED
            </Text>
            <TextInput
              style={{
                backgroundColor: c.surface,
                borderWidth: 1,
                borderColor: c.borderDefault,
                borderRadius: 8,
                padding: sp.lg,
                fontSize: 26,
                textAlign: "center",
                color: c.signal,
                fontFamily: t.monoLg.fontFamily,
                letterSpacing: -0.5,
                marginBottom: sp.sm,
              }}
              value={prePaymentAmount}
              onChangeText={setPrePaymentAmount}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={c.textMuted}
              selectTextOnFocus
            />
            <View
              style={{ flexDirection: "row", gap: sp.sm, marginBottom: sp.xl }}
            >
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: sp.md,
                  borderRadius: 8,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                  alignItems: "center",
                }}
                onPress={() => setPrePaymentAmount(finalTotal.toFixed(2))}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: c.textSecondary,
                    fontFamily: t.bodyMed.fontFamily,
                  }}
                >
                  Full {currency.symbol}
                  {finalTotal.toFixed(2)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: sp.md,
                  borderRadius: 8,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                  alignItems: "center",
                }}
                onPress={() => setPrePaymentAmount((finalTotal / 2).toFixed(2))}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: c.textSecondary,
                    fontFamily: t.bodyMed.fontFamily,
                  }}
                >
                  Half {currency.symbol}
                  {(finalTotal / 2).toFixed(2)}
                </Text>
              </TouchableOpacity>
            </View>

            <Text
              style={{
                fontSize: 9,
                letterSpacing: 1,
                color: c.textMuted,
                fontFamily: t.labelSm.fontFamily,
                marginBottom: sp.md,
              }}
            >
              PAYMENT METHOD
            </Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: sp.sm,
                marginBottom: sp.xl,
              }}
            >
              {[
                { value: "cash", label: "Cash", icon: "dollar-sign" as const },
                {
                  value: "bank",
                  label: "Bank Transfer",
                  icon: "arrow-up-right" as const,
                },
                { value: "pos", label: "POS", icon: "credit-card" as const },
                {
                  value: "mobile",
                  label: "Mobile Money",
                  icon: "smartphone" as const,
                },
              ].map((method) => (
                <TouchableOpacity
                  key={method.value}
                  style={{
                    flex: 1,
                    minWidth: "45%",
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: sp.sm,
                    paddingVertical: sp.lg,
                    borderRadius: 8,
                    backgroundColor: c.brandInteractive,
                    borderWidth: 1,
                    borderColor: c.brandInteractive,
                  }}
                  onPress={() => handleCheckoutWithPayment(method.value as any)}
                  activeOpacity={0.75}
                >
                  <Feather name={method.icon} size={15} color={c.air} />
                  <Text
                    style={{
                      fontSize: 13,
                      color: c.air,
                      fontFamily: t.bodyMed.fontFamily,
                    }}
                  >
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: sp.sm }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: sp.lg,
                  borderRadius: 8,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                  alignItems: "center",
                }}
                onPress={() => handleCheckoutWithPayment("unpaid")}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: c.textSecondary,
                    fontFamily: t.bodyMed.fontFamily,
                  }}
                >
                  Record as Unpaid
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: sp.lg,
                  borderRadius: 8,
                  backgroundColor: c.surfaceOverlay,
                  alignItems: "center",
                }}
                onPress={() => setShowPrePaymentModal(false)}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: c.textMuted,
                    fontFamily: t.body.fontFamily,
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Discount Modal */}
      <Modal
        visible={showDiscountModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDiscountModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: c.surfaceRaised,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: sp.xl,
              paddingBottom: 40,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 999,
                backgroundColor: c.borderDefault,
                alignSelf: "center",
                marginBottom: sp.xl,
              }}
            />
            <Text
              style={{
                color: c.textPrimary,
                fontFamily: t.h2.fontFamily,
                fontSize: 20,
                marginBottom: sp.xl,
              }}
            >
              Add Discount
            </Text>
            <View
              style={{ flexDirection: "row", gap: sp.sm, marginBottom: sp.lg }}
            >
              {(["fixed", "percent"] as const).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={{
                    flex: 1,
                    padding: sp.md,
                    borderRadius: 8,
                    backgroundColor:
                      discountType === type ? c.brandInteractive : c.surface,
                    borderWidth: 1,
                    borderColor:
                      discountType === type
                        ? c.brandInteractive
                        : c.borderSubtle,
                    alignItems: "center",
                  }}
                  onPress={() => setDiscountType(type)}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color: discountType === type ? c.air : c.textSecondary,
                      fontFamily:
                        discountType === type
                          ? t.bodyMed.fontFamily
                          : t.bodySm.fontFamily,
                    }}
                  >
                    {type === "fixed"
                      ? `Fixed (${currency.symbol})`
                      : "Percentage (%)"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={{
                backgroundColor: c.surface,
                borderWidth: 1,
                borderColor: c.borderDefault,
                borderRadius: 8,
                padding: sp.lg,
                fontSize: 24,
                textAlign: "center",
                color: c.signal,
                fontFamily: t.monoLg.fontFamily,
                letterSpacing: -0.5,
                marginBottom: sp.sm,
              }}
              value={discount.toString()}
              onChangeText={(text) => setDiscount(parseFloat(text) || 0)}
              keyboardType="numeric"
              placeholder={discountType === "fixed" ? "0.00" : "0"}
              placeholderTextColor={c.textMuted}
            />
            {discountType === "percent" && discount > 100 && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginBottom: sp.sm,
                }}
              >
                <Feather name="alert-triangle" size={12} color={c.negative} />
                <Text
                  style={{
                    fontSize: 11,
                    color: c.negative,
                    fontFamily: t.bodySm.fontFamily,
                  }}
                >
                  Discount cannot exceed 100%
                </Text>
              </View>
            )}
            <View
              style={{ flexDirection: "row", gap: sp.sm, marginTop: sp.md }}
            >
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: sp.lg,
                  borderRadius: 8,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                  alignItems: "center",
                }}
                onPress={() => {
                  setDiscount(0);
                  setShowDiscountModal(false);
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: c.negative,
                    fontFamily: t.bodyMed.fontFamily,
                  }}
                >
                  Clear
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1.5,
                  padding: sp.lg,
                  borderRadius: 8,
                  backgroundColor: c.brandInteractive,
                  alignItems: "center",
                }}
                onPress={() => setShowDiscountModal(false)}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: c.air,
                    fontFamily: t.bodyMed.fontFamily,
                  }}
                >
                  Apply
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Tax Modal */}
      <Modal
        visible={showTaxModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTaxModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: c.surfaceRaised,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: sp.xl,
              paddingBottom: 40,
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 999,
                backgroundColor: c.borderDefault,
                alignSelf: "center",
                marginBottom: sp.xl,
              }}
            />
            <Text
              style={{
                color: c.textPrimary,
                fontFamily: t.h2.fontFamily,
                fontSize: 20,
                marginBottom: sp.xl,
              }}
            >
              Add Tax
            </Text>
            <Text
              style={{
                fontSize: 9,
                letterSpacing: 1,
                color: c.textMuted,
                fontFamily: t.labelSm.fontFamily,
                marginBottom: sp.md,
              }}
            >
              TAX RATE (%)
            </Text>
            <TextInput
              style={{
                backgroundColor: c.surface,
                borderWidth: 1,
                borderColor: c.borderDefault,
                borderRadius: 8,
                padding: sp.lg,
                fontSize: 24,
                textAlign: "center",
                color: c.signal,
                fontFamily: t.monoLg.fontFamily,
                letterSpacing: -0.5,
                marginBottom: sp.md,
              }}
              value={taxRate.toString()}
              onChangeText={(text) => setTaxRate(parseFloat(text) || 0)}
              keyboardType="numeric"
              placeholder="0.00"
              placeholderTextColor={c.textMuted}
            />
            <View
              style={{ flexDirection: "row", gap: sp.sm, marginBottom: sp.xl }}
            >
              {[
                { label: "5% VAT", val: 5 },
                { label: "7.5% VAT", val: 7.5 },
              ].map((q) => (
                <TouchableOpacity
                  key={q.val}
                  style={{
                    flex: 1,
                    padding: sp.md,
                    borderRadius: 8,
                    backgroundColor:
                      taxRate === q.val ? c.brandInteractiveDim : c.surface,
                    borderWidth: 1,
                    borderColor:
                      taxRate === q.val ? c.brandInteractive : c.borderSubtle,
                    alignItems: "center",
                  }}
                  onPress={() => setTaxRate(q.val)}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      color:
                        taxRate === q.val
                          ? c.brandInteractive
                          : c.textSecondary,
                      fontFamily: t.monoSm.fontFamily,
                    }}
                  >
                    {q.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={{ flexDirection: "row", gap: sp.sm }}>
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: sp.lg,
                  borderRadius: 8,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                  alignItems: "center",
                }}
                onPress={() => {
                  setTaxRate(0);
                  setShowTaxModal(false);
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: c.negative,
                    fontFamily: t.bodyMed.fontFamily,
                  }}
                >
                  Clear
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1.5,
                  padding: sp.lg,
                  borderRadius: 8,
                  backgroundColor: c.brandInteractive,
                  alignItems: "center",
                }}
                onPress={() => setShowTaxModal(false)}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: c.air,
                    fontFamily: t.bodyMed.fontFamily,
                  }}
                >
                  Apply
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Bulk Price Selection Modal */}
      <Modal
        visible={showBulkPriceModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBulkPriceModal(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.55)",
            justifyContent: "flex-end",
          }}
        >
          <View
            style={{
              backgroundColor: c.surfaceRaised,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              padding: sp.xl,
              paddingBottom: 40,
              maxHeight: "85%",
            }}
          >
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 999,
                backgroundColor: c.borderDefault,
                alignSelf: "center",
                marginBottom: sp.lg,
              }}
            />
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
            >
              <Text
                style={{
                  color: c.textPrimary,
                  fontFamily: t.h2.fontFamily,
                  fontSize: 18,
                  marginBottom: 4,
                }}
              >
                {selectedProduct?.name}
              </Text>
              <Text
                style={{
                  fontSize: 9,
                  letterSpacing: 1,
                  color: c.textMuted,
                  fontFamily: t.labelSm.fontFamily,
                  marginBottom: sp.lg,
                }}
              >
                SELECT PRICE TIER
              </Text>

              {/* Single unit option */}
              <TouchableOpacity
                style={{
                  backgroundColor: !selectedBulkPrice
                    ? c.brandInteractiveDim
                    : c.surface,
                  borderWidth: 1,
                  borderColor: !selectedBulkPrice
                    ? c.brandInteractive
                    : c.borderSubtle,
                  borderRadius: 10,
                  padding: sp.lg,
                  marginBottom: sp.sm,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
                onPress={() => setSelectedBulkPrice(null)}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      color: c.textPrimary,
                      fontFamily: t.bodyMed.fontFamily,
                      marginBottom: 3,
                    }}
                  >
                    Single Unit
                  </Text>
                  <Text
                    style={{
                      fontSize: 11,
                      color: c.textMuted,
                      fontFamily: t.monoSm.fontFamily,
                    }}
                  >
                    {currency.symbol}
                    {selectedProduct?.default_selling_price?.toFixed(2) ||
                      "0.00"}{" "}
                    each
                  </Text>
                </View>
                {!selectedBulkPrice && (
                  <Feather
                    name="check-circle"
                    size={18}
                    color={c.brandInteractive}
                  />
                )}
              </TouchableOpacity>

              {productBulkPrices.map((bulkPrice) => (
                <TouchableOpacity
                  key={bulkPrice.id}
                  style={{
                    backgroundColor:
                      selectedBulkPrice?.id === bulkPrice.id
                        ? c.brandInteractiveDim
                        : c.surface,
                    borderWidth: 1,
                    borderColor:
                      selectedBulkPrice?.id === bulkPrice.id
                        ? c.brandInteractive
                        : c.borderSubtle,
                    borderRadius: 10,
                    padding: sp.lg,
                    marginBottom: sp.sm,
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                  onPress={() => setSelectedBulkPrice(bulkPrice)}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 14,
                        color: c.textPrimary,
                        fontFamily: t.bodyMed.fontFamily,
                        marginBottom: 2,
                      }}
                    >
                      {bulkPrice.name} ({bulkPrice.quantity_multiplier} units)
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: c.textMuted,
                        fontFamily: t.monoSm.fontFamily,
                        marginBottom: 2,
                      }}
                    >
                      {currency.symbol}
                      {bulkPrice.unit_price.toFixed(2)} per unit
                    </Text>
                    <Text
                      style={{
                        fontSize: 11,
                        color: c.signal,
                        fontFamily: t.monoSm.fontFamily,
                      }}
                    >
                      Total: {currency.symbol}
                      {(
                        bulkPrice.quantity_multiplier * bulkPrice.unit_price
                      ).toFixed(2)}
                    </Text>
                  </View>
                  {selectedBulkPrice?.id === bulkPrice.id && (
                    <Feather
                      name="check-circle"
                      size={18}
                      color={c.brandInteractive}
                    />
                  )}
                </TouchableOpacity>
              ))}

              {/* Quantity */}
              <Text
                style={{
                  fontSize: 9,
                  letterSpacing: 1,
                  color: c.textMuted,
                  fontFamily: t.labelSm.fontFamily,
                  marginTop: sp.xl,
                  marginBottom: sp.md,
                }}
              >
                QUANTITY
                {selectedBulkPrice
                  ? `  ·  ${selectedBulkPrice.name.toUpperCase()}S`
                  : ""}
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: sp.lg,
                  marginBottom: sp.lg,
                }}
              >
                <TouchableOpacity
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    backgroundColor: c.brandInteractive,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                  onPress={() => {
                    const cur = parseFloat(bulkQuantity) || 1;
                    if (cur > 1) setBulkQuantity((cur - 1).toString());
                  }}
                >
                  <Feather name="minus" size={18} color={c.air} />
                </TouchableOpacity>
                <TextInput
                  style={{
                    width: 72,
                    height: 44,
                    borderWidth: 1,
                    borderColor: c.borderDefault,
                    borderRadius: 8,
                    textAlign: "center",
                    fontSize: 20,
                    color: c.textPrimary,
                    fontFamily: t.mono.fontFamily,
                    backgroundColor: c.surface,
                  }}
                  value={bulkQuantity}
                  onChangeText={setBulkQuantity}
                  keyboardType="numeric"
                />
                <TouchableOpacity
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    backgroundColor: c.brandInteractive,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                  onPress={() => {
                    const cur = parseFloat(bulkQuantity) || 1;
                    setBulkQuantity((cur + 1).toString());
                  }}
                >
                  <Feather name="plus" size={18} color={c.air} />
                </TouchableOpacity>
              </View>
              <View
                style={{
                  padding: sp.md,
                  backgroundColor: c.surface,
                  borderRadius: 8,
                  alignItems: "center",
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    color: c.textMuted,
                    fontFamily: t.monoSm.fontFamily,
                    marginBottom: 3,
                  }}
                >
                  {selectedBulkPrice
                    ? `${bulkQuantity} × ${selectedBulkPrice.quantity_multiplier} = ${(parseFloat(bulkQuantity) || 0) * selectedBulkPrice.quantity_multiplier} units`
                    : `${bulkQuantity} unit${parseFloat(bulkQuantity) > 1 ? "s" : ""}`}
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    color: c.signal,
                    fontFamily: t.mono.fontFamily,
                    letterSpacing: -0.3,
                  }}
                >
                  {currency.symbol}
                  {(
                    (parseFloat(bulkQuantity) || 0) *
                    (selectedBulkPrice?.quantity_multiplier || 1) *
                    (selectedBulkPrice?.unit_price ||
                      selectedProduct?.default_selling_price ||
                      0)
                  ).toFixed(2)}
                </Text>
              </View>
            </ScrollView>

            <View
              style={{ flexDirection: "row", gap: sp.sm, marginTop: sp.lg }}
            >
              <TouchableOpacity
                style={{
                  flex: 1,
                  padding: sp.lg,
                  borderRadius: 8,
                  backgroundColor: c.surface,
                  borderWidth: 1,
                  borderColor: c.borderSubtle,
                  alignItems: "center",
                }}
                onPress={() => setShowBulkPriceModal(false)}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: c.textSecondary,
                    fontFamily: t.bodyMed.fontFamily,
                  }}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  flex: 1.5,
                  padding: sp.lg,
                  borderRadius: 8,
                  backgroundColor: c.brandInteractive,
                  alignItems: "center",
                }}
                onPress={processAddToCart}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: c.air,
                    fontFamily: t.bodyMed.fontFamily,
                  }}
                >
                  Add to Cart
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <FloatingReceiptShare
        visible={showReceiptShare}
        onDismiss={() => {
          setShowReceiptShare(false);
          setCompletedSale(null);
        }}
        receiptNumber={completedSale?.receiptNumber || ""}
        onGetReceiptData={() =>
          completedSaleRef.current
            ? getSaleReceiptData(completedSaleRef.current)
            : Promise.resolve(null)
        }
        onGeneratePDF={generateSaleReceipt}
        customerPhone={selectedCustomer?.phone}
        customerEmail={selectedCustomer?.email}
        totalAmount={completedSale?.totalAmount}
        receiptType="sale"
      />
    </View>
  );
}
