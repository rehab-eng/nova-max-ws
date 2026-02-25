"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import {
  ClipboardList,
  Copy,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  PackagePlus,
  RefreshCw,
  Settings,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://nova-backend.rehabha770.workers.dev";

type Order = {
  id: string;
  store_id: string | null;
  driver_id: string | null;
  customer_name: string | null;
  customer_location_text: string | null;
  order_type: string | null;
  receiver_name: string | null;
  payout_method: string | null;
  price: number | null;
  delivery_fee: number | null;
  status: string | null;
  created_at: string | null;
  delivered_at?: string | null;
};

type DriverRow = {
  id: string;
  name: string | null;
  phone: string | null;
  status: string | null;
  wallet_balance: number | null;
  is_active: number | null;
  driver_code?: string | null;
  secret_code?: string | null;
};

type LedgerSummaryRow = {
  period: string;
  trips: number;
  delivery_total: number;
};

type LedgerWalletRow = {
  period: string;
  credits: number;
  debits: number;
};

type LedgerDriverRow = {
  driver_id: string;
  driver_name: string | null;
  period: string;
  trips: number;
  delivery_total: number;
};

type SavedStore = {
  id: string;
  name: string | null;
  store_code: string | null;
};

type ApiResponse = Record<string, any>;

type SectionKey =
  | "dashboard"
  | "orders"
  | "create_order"
  | "drivers"
  | "finance"
  | "inventory"
  | "settings";

const sectionNav: Array<{ key: SectionKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { key: "orders", label: "قائمة الطلبات", icon: ClipboardList },
  { key: "create_order", label: "إنشاء طلب", icon: PackagePlus },
  { key: "drivers", label: "السائقون", icon: Users },
  { key: "finance", label: "المالية", icon: Wallet },
  { key: "inventory", label: "الجرد", icon: ListOrdered },
  { key: "settings", label: "قائمة المتاجر", icon: Settings },
];

const navButtonBase =
  "w-full rounded-md px-3 py-2 text-sm font-semibold transition flex items-center justify-between text-right";
const navButtonActive = "bg-orange-500 text-white";
const navButtonInactive = "text-slate-200 hover:bg-slate-800/60";

const statusStyles: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700 border-slate-200",
  accepted: "bg-slate-100 text-slate-700 border-slate-200",
  delivering: "bg-orange-100 text-orange-700 border-orange-200",
  delivered: "bg-slate-900 text-white border-slate-900",
  cancelled: "bg-slate-200 text-slate-600 border-slate-200",
};

const statusLabels: Record<string, string> = {
  pending: "قيد الانتظار",
  accepted: "تم القبول",
  delivering: "قيد التوصيل",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

function formatStatus(value: string | null | undefined): string {
  if (!value) return "-";
  return statusLabels[value] ?? value;
}

const payoutLabels: Record<string, string> = {
  wallet: "محفظة محلية",
  cash: "كاش",
};

function formatPayout(value: string | null | undefined): string {
  if (!value) return "-";
  return payoutLabels[value] ?? value;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("ar", { day: "2-digit", month: "short" });
}

function formatOrderNumber(id: string): string {
  const clean = id.replace(/-/g, "");
  if (!clean) return "-";
  const tail = clean.slice(-8);
  const numeric = Number.parseInt(tail, 16);
  if (Number.isNaN(numeric)) return clean.slice(0, 6).toUpperCase();
  return String(numeric % 1_000_000).padStart(6, "0");
}

function formatOrderTotal(order: Order): string {
  const hasAmount =
    typeof order.price === "number" || typeof order.delivery_fee === "number";
  if (!hasAmount) return "-";
  const price = typeof order.price === "number" ? order.price : 0;
  const fee = typeof order.delivery_fee === "number" ? order.delivery_fee : 0;
  return (price + fee).toFixed(2);
}

function buildWsUrl(path: string, params: Record<string, string>): string {
  const url = new URL(API_BASE);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = path;
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

export default function StorePanel() {
  const [storeId, setStoreId] = useState("");
  const [storeCode, setStoreCode] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [isAuthed, setIsAuthed] = useState(false);
  const [authChecking, setAuthChecking] = useState(false);
  const [storeName, setStoreName] = useState("");
  const [storeLabel, setStoreLabel] = useState<string | null>(null);
  const [savedStores, setSavedStores] = useState<SavedStore[]>([]);
  const [orderStoreId, setOrderStoreId] = useState("");
  const [deleteStoreId, setDeleteStoreId] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverCode, setDriverCode] = useState<string | null>(null);
  const [walletDriverId, setWalletDriverId] = useState("");
  const [walletAmount, setWalletAmount] = useState("");
  const [walletMethod, setWalletMethod] = useState("wallet");
  const [walletNote, setWalletNote] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [activeSection, setActiveSection] = useState<SectionKey>("dashboard");
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [ledgerSummary, setLedgerSummary] = useState<LedgerSummaryRow[]>([]);
  const [ledgerWallet, setLedgerWallet] = useState<LedgerWalletRow[]>([]);
  const [ledgerDrivers, setLedgerDrivers] = useState<LedgerDriverRow[]>([]);
  const [ledgerPeriod, setLedgerPeriod] = useState("daily");
  const [realtimeStatus, setRealtimeStatus] = useState<
    "connecting" | "connected" | "disconnected"
  >("disconnected");

  const ordersRef = useRef<Order[]>([]);
  const hasLoadedRef = useRef(false);
  const flashTimers = useRef<Map<string, number>>(new Map());
  const activeSectionRef = useRef<SectionKey>("dashboard");
  const driverStatusRef = useRef<Map<string, string>>(new Map());
  const pendingCreateRef = useRef<{
    receiverName: string | null;
    location: string | null;
    orderType: string | null;
    price: number | null;
    expiresAt: number;
  } | null>(null);

  useEffect(() => {
    setStoreId(localStorage.getItem("nova.store_id") ?? "");
    setStoreCode(localStorage.getItem("nova.store_code") ?? "");
    setAdminCode(localStorage.getItem("nova.admin_code") ?? "");
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem("nova.stores");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as SavedStore[];
      if (Array.isArray(parsed)) setSavedStores(parsed);
    } catch {
      // ignore parse errors
    }
  }, []);

  const availableStores = useMemo(() => {
    const list = [...savedStores];
    if (storeId) {
      const current: SavedStore = {
        id: storeId,
        name: storeLabel ?? null,
        store_code: storeCode || null,
      };
      const idx = list.findIndex((item) => item.id === storeId);
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...current };
      } else {
        list.unshift(current);
      }
    }
    return list;
  }, [savedStores, storeId, storeLabel, storeCode]);

  const selectedOrderStore = useMemo(
    () => availableStores.find((store) => store.id === orderStoreId) ?? null,
    [availableStores, orderStoreId]
  );

  useEffect(() => {
    localStorage.setItem("nova.stores", JSON.stringify(savedStores));
  }, [savedStores]);

  useEffect(() => {
    localStorage.setItem("nova.store_id", storeId);
  }, [storeId]);

  useEffect(() => {
    ordersRef.current = [];
    setOrders([]);
    hasLoadedRef.current = false;
  }, [storeId]);

  useEffect(() => {
    localStorage.setItem("nova.store_code", storeCode);
  }, [storeCode]);

  useEffect(() => {
    if (isAuthed && adminCode) {
      localStorage.setItem("nova.admin_code", adminCode);
    }
    if (!isAuthed) {
      localStorage.removeItem("nova.admin_code");
    }
  }, [adminCode, isAuthed]);

  useEffect(() => {
    if (orderStoreId) return;
    if (availableStores.length === 1) {
      setOrderStoreId(availableStores[0].id);
    }
  }, [orderStoreId, availableStores]);

  useEffect(() => {
    if (!orderStoreId) return;
    const exists = availableStores.some((store) => store.id === orderStoreId);
    if (!exists) setOrderStoreId("");
  }, [orderStoreId, availableStores]);

  const clearStore = () => {
    localStorage.removeItem("nova.store_id");
    localStorage.removeItem("nova.store_code");
    setStoreId("");
    setStoreCode("");
    setStoreLabel(null);
    setOrderStoreId("");
    setRealtimeStatus("disconnected");
  };

  const logoutAdmin = () => {
    localStorage.removeItem("nova.admin_code");
    setIsAuthed(false);
    clearStore();
    setSavedStores([]);
    setAdminCode("");
  };

  const deleteStore = async () => {
    if (!adminCode) {
      toast.error("رمز المنظومة مطلوب");
      return;
    }
    const target = savedStores.find((store) => store.id === deleteStoreId);
    const storeKey = target?.id ?? target?.store_code;
    if (!storeKey) {
      toast.error("اختر متجرًا للحذف أولاً");
      return;
    }

    const toastId = toast.loading("جاري حذف المتجر...");
    try {
      const res = await fetch(
        `${API_BASE}/stores/${encodeURIComponent(storeKey)}?purge=1`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json", "X-Admin-Code": adminCode },
          body: JSON.stringify({ admin_code: adminCode, purge: true }),
        }
      );
      const data = (await res.json()) as ApiResponse;
      if (data?.ok) {
        toast.success("تم حذف المتجر", { id: toastId });
        setSavedStores((prev) =>
          prev.filter((item) => item.id !== storeKey && item.store_code !== storeKey)
        );
        if (storeId === storeKey || storeCode === storeKey) {
          clearStore();
        }
        if (deleteStoreId === storeKey) {
          setDeleteStoreId("");
        }
      } else {
        toast.error(data?.error ?? "تعذر حذف المتجر", { id: toastId });
      }
    } catch {
      toast.error("خطأ في الشبكة", { id: toastId });
    }
  };

  const upsertSavedStore = (store: SavedStore) => {
    setSavedStores((prev) => {
      const next = prev.filter((item) => item.id !== store.id);
      return [store, ...next].slice(0, 12);
    });
  };

  const selectSavedStore = (store: SavedStore) => {
    applyStoreSelection(store);
  };

  const goToSection = (section: SectionKey) => {
    if (section === "drivers") {
      fetchDrivers();
    }
    if (section === "finance") {
      fetchLedger(ledgerPeriod);
    }
    if (section === "orders" || section === "inventory" || section === "create_order") {
      refreshOrders();
    }
    setActiveSection(section);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const applyStoreSelection = (store: SavedStore | null) => {
    if (!store) {
      setStoreId("");
      setStoreLabel(null);
      setStoreCode("");
      setOrderStoreId("");
      return;
    }
    setStoreId(store.id);
    setStoreLabel(store.name ?? null);
    setStoreCode(store.store_code ?? "");
  };

  const fetchStores = async (silent = true) => {
    if (!adminCode) return;
    const toastId = silent ? null : toast.loading("جاري تحديث قائمة المتاجر...");
    try {
      const res = await fetch(
        `${API_BASE}/stores?admin_code=${encodeURIComponent(adminCode)}`
      );
      const data = (await res.json()) as ApiResponse;
      if (data?.stores) {
        const list = data.stores as SavedStore[];
        setSavedStores(list);
        const selected =
          list.find((store) => store.id === storeId) ?? list[0] ?? null;
        applyStoreSelection(selected);
        setIsAuthed(true);
        if (!deleteStoreId && list.length > 0) {
          setDeleteStoreId(selected?.id ?? list[0].id);
        }
        if (toastId) toast.success("تم تحديث القائمة", { id: toastId });
      } else if (toastId) {
        toast.error(data?.error ?? "تعذر جلب المتاجر", { id: toastId });
        setIsAuthed(false);
        setSavedStores([]);
        clearStore();
      }
    } catch {
      if (toastId) toast.error("خطأ في الشبكة", { id: toastId });
      setIsAuthed(false);
    }
  };

  useEffect(() => {
    if (!adminCode) {
      setIsAuthed(false);
      return;
    }
    setAuthChecking(true);
    fetchStores(true).finally(() => setAuthChecking(false));
  }, [adminCode]);

  useEffect(() => {
    if (!adminCode || !storeId) return;
    refreshOrders(true);
    fetchDrivers();
    fetchLedger(ledgerPeriod);
  }, [adminCode, storeId]);

  useEffect(() => {
    activeSectionRef.current = activeSection;
  }, [activeSection]);

  const flashOrder = (id: string) => {
    setFlashIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });

    const existing = flashTimers.current.get(id);
    if (existing) window.clearTimeout(existing);

    const timeout = window.setTimeout(() => {
      setFlashIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      flashTimers.current.delete(id);
    }, 2000);

    flashTimers.current.set(id, timeout);
  };

  const confirmPendingCreate = (nextOrders: Order[]) => {
    const pending = pendingCreateRef.current;
    if (!pending) return;
    const now = Date.now();
    const match = nextOrders.find((order) => {
      const name = (order.receiver_name ?? order.customer_name ?? "").trim();
      const location = (order.customer_location_text ?? "").trim();
      const orderType = (order.order_type ?? "").trim();
      const price = typeof order.price === "number" ? order.price : 0;
      const createdAt = order.created_at
        ? new Date(order.created_at).getTime()
        : 0;
      const recent = createdAt ? Math.abs(now - createdAt) < 60000 : true;
      return (
        recent &&
        name === (pending.receiverName ?? "") &&
        location === (pending.location ?? "") &&
        orderType === (pending.orderType ?? "") &&
        price === (pending.price ?? 0)
      );
    });

    if (match) {
      pendingCreateRef.current = null;
      toast.success("تم إنشاء الطلب بنجاح");
      return;
    }

    if (now > pending.expiresAt) {
      pendingCreateRef.current = null;
      toast.error("تعذر تأكيد إنشاء الطلب، تحقق من القائمة.");
    }
  };

  const applyOrders = (nextOrders: Order[], showToasts: boolean) => {
    const prev = ordersRef.current;
    const prevMap = new Map(prev.map((order) => [order.id, order]));

    if (showToasts) {
      for (const order of nextOrders) {
        const previous = prevMap.get(order.id);
        if (!previous) {
          toast.success(`طلب جديد #${formatOrderNumber(order.id)}`);
          flashOrder(order.id);
        } else if (previous.status !== order.status) {
          toast.custom(
            (t) => (
              <div
                className={`pointer-events-auto rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-lg transition ${
                  t.visible ? "opacity-100" : "opacity-0"
                }`}
              >
                <div className="flex items-center gap-2 text-slate-900">
                  <PackagePlus className="h-4 w-4 text-slate-600" />
                  <span>
                    حالة الطلب #{formatOrderNumber(order.id)} أصبحت{" "}
                    {formatStatus(order.status)}
                  </span>
                </div>
              </div>
            ),
            { duration: 2500 }
          );
          flashOrder(order.id);
        }
      }
    }

    confirmPendingCreate(nextOrders);
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
  };

  const refreshOrders = async (showToasts = false) => {
    if (!storeId || !adminCode) return;
    const query = `store_id=${encodeURIComponent(storeId)}&admin_code=${encodeURIComponent(adminCode)}`;
    try {
      const res = await fetch(`${API_BASE}/orders?${query}`);
      const data = (await res.json()) as ApiResponse;
      if (data?.orders) {
        applyOrders(data.orders as Order[], showToasts && hasLoadedRef.current);
        if (!hasLoadedRef.current) hasLoadedRef.current = true;
      }
    } catch {
      if (showToasts) toast.error("تعذر تحميل الطلبات");
    }
  };

  useEffect(() => {
    if (!storeId || !adminCode) return;
    let active = true;
    let source: EventSource | null = null;
    let socket: WebSocket | null = null;
    let pingTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let retry = 0;
    const query = `store_id=${encodeURIComponent(storeId)}&admin_code=${encodeURIComponent(adminCode)}`;

    const fetchOrders = async (showToasts: boolean) => {
      try {
        const res = await fetch(`${API_BASE}/orders?${query}`);
        const data = (await res.json()) as ApiResponse;
        if (active && data?.orders) {
          applyOrders(data.orders, showToasts && hasLoadedRef.current);
          if (!hasLoadedRef.current) hasLoadedRef.current = true;
        }
      } catch {
        if (showToasts) toast.error("تعذر تحميل الطلبات");
      }
    };

    const upsertOrder = (
      incoming: Partial<Order> & { id: string },
      showToasts = true
    ) => {
      const current = ordersRef.current;
      const idx = current.findIndex((order) => order.id === incoming.id);
      let next: Order[];
      if (idx >= 0) {
        next = [...current];
        next[idx] = { ...next[idx], ...incoming };
      } else {
        next = [incoming as Order, ...current];
      }
      const shouldToast = showToasts && hasLoadedRef.current;
      applyOrders(next, shouldToast);
      if (!hasLoadedRef.current) hasLoadedRef.current = true;
    };

    const handleRealtime = (payload: Record<string, unknown>) => {
      const type = payload.type;
      if (type === "order_created" && payload.order && typeof payload.order === "object") {
        const order = payload.order as Order;
        if (order.store_id && order.store_id !== storeId) return;
        upsertOrder(order);
        return;
      }
      if (type === "order_status" && typeof payload.order_id === "string") {
        if (payload.store_id && payload.store_id !== storeId) return;
        upsertOrder(
          {
            id: payload.order_id,
            status: typeof payload.status === "string" ? payload.status : null,
            driver_id:
              typeof payload.driver_id === "string" ? payload.driver_id : null,
            delivered_at:
              typeof payload.delivered_at === "string"
                ? payload.delivered_at
                : null,
          },
          true
        );
        return;
      }
      if (type === "driver_status") {
        if (typeof payload.driver_id === "string") {
          const nextStatus =
            typeof payload.status === "string" ? payload.status : "";
          const prevStatus = driverStatusRef.current.get(payload.driver_id);
          if (nextStatus && prevStatus === nextStatus) return;
          if (nextStatus) driverStatusRef.current.set(payload.driver_id, nextStatus);
          setDrivers((prev) =>
            prev.map((driver) =>
              driver.id === payload.driver_id
                ? {
                    ...driver,
                    status: typeof payload.status === "string" ? payload.status : driver.status,
                  }
                : driver
            )
          );
        }
        return;
      }
      if (type === "driver_created") {
        toast.success("تم إنشاء سائق جديد");
        fetchDrivers();
        return;
      }
      if (type === "driver_disabled") {
        if (typeof payload.driver_id === "string") {
          setDrivers((prev) =>
            prev.map((driver) =>
              driver.id === payload.driver_id
                ? { ...driver, is_active: 0, status: "offline" }
                : driver
            )
          );
        }
        toast("تم تعطيل سائق");
        return;
      }
      if (type === "driver_active") {
        if (typeof payload.driver_id === "string") {
          setDrivers((prev) =>
            prev.map((driver) =>
              driver.id === payload.driver_id
                ? { ...driver, is_active: 1, status: "offline" }
                : driver
            )
          );
        }
        toast("تم تفعيل سائق");
        return;
      }
      if (type === "wallet_transaction") {
        toast("تم تحديث محفظة السائق");
        if (activeSection === "finance") {
          fetchLedger(ledgerPeriod);
        }
      }
    };

    const startSocket = () => {
      setRealtimeStatus("connecting");
      const wsUrl = buildWsUrl("/realtime", {
        role: "admin",
        admin_code: adminCode,
      });
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        retry = 0;
        setRealtimeStatus("connected");
        if (pingTimer) window.clearInterval(pingTimer);
        pingTimer = window.setInterval(() => {
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "ping" }));
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        if (!active) return;
        try {
          const payload = JSON.parse(event.data) as Record<string, unknown>;
          handleRealtime(payload);
        } catch {
          // ignore
        }
      };

      socket.onerror = () => {
        socket?.close();
      };

      socket.onclose = () => {
        if (pingTimer) window.clearInterval(pingTimer);
        if (!active) return;
        setRealtimeStatus("disconnected");
        const delay = Math.min(30000, 1000 * 2 ** retry);
        retry += 1;
        reconnectTimer = window.setTimeout(startSocket, delay);
      };
    };

    const startSSE = () => {
      source = new EventSource(`${API_BASE}/orders/stream?${query}`);
      source.addEventListener("orders", (event) => {
        if (!active) return;
        const list = JSON.parse((event as MessageEvent).data) as Order[];
        applyOrders(list, hasLoadedRef.current);
        if (!hasLoadedRef.current) hasLoadedRef.current = true;
      });
      source.onerror = () => {
        source?.close();
        source = null;
      };
    };

    startSocket();
    fetchOrders(false);

    const poll = window.setInterval(() => {
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        fetchOrders(true);
      }
    }, 6000);

    return () => {
      active = false;
      source?.close();
      socket?.close();
      if (pingTimer) window.clearInterval(pingTimer);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(poll);
    };
  }, [storeId, adminCode]);

  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter((order) => order.status === "pending").length;
    const delivering = orders.filter((order) => order.status === "delivering").length;
    const delivered = orders.filter((order) => order.status === "delivered").length;
    return { total, pending, delivering, delivered };
  }, [orders]);

  const canCreateOrder = Boolean(adminCode && orderStoreId);

  const driverCodeMap = useMemo(() => {
    const map = new Map<string, string>();
    drivers.forEach((driver) => {
      const code = driver.driver_code ?? driver.secret_code;
      if (driver.id && code) map.set(driver.id, code);
    });
    return map;
  }, [drivers]);

  const formatDriverDisplay = (id?: string | null) => {
    if (!id) return "-";
    const code = driverCodeMap.get(id);
    if (code) return `#${code}`;
    return `#${formatOrderNumber(id)}`;
  };

  const sortedOrders = useMemo(() => {
    return [...orders].sort((a, b) => {
      const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
      if (ta !== tb) return tb - ta;
      return a.id.localeCompare(b.id);
    });
  }, [orders]);

  const recentOrders = useMemo(() => sortedOrders.slice(0, 5), [sortedOrders]);

  const activeDriversCount = useMemo(
    () => drivers.filter((driver) => driver.is_active !== 0).length,
    [drivers]
  );

  const onlineDriversCount = useMemo(
    () =>
      drivers.filter(
        (driver) => driver.is_active !== 0 && driver.status === "online"
      ).length,
    [drivers]
  );

  const sortedDrivers = useMemo(() => {
    return [...drivers].sort((a, b) => {
      const aActive = a.is_active !== 0;
      const bActive = b.is_active !== 0;
      if (aActive !== bActive) return aActive ? -1 : 1;
      const aOnline = a.status === "online";
      const bOnline = b.status === "online";
      if (aOnline !== bOnline) return aOnline ? -1 : 1;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [drivers]);

  const inventorySummary = useMemo(() => {
    const toLibyaDate = (value?: string | null) => {
      if (!value) return null;
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      return new Date(
        parsed.toLocaleString("en-US", { timeZone: "Africa/Tripoli" })
      );
    };

    const nowLibya =
      toLibyaDate(new Date().toISOString()) ??
      new Date(new Date().toLocaleString("en-US", { timeZone: "Africa/Tripoli" }));

    const weekStart = new Date(nowLibya);
    const day = weekStart.getDay(); // 0 Sunday ... 6 Saturday
    const diff = (day - 6 + 7) % 7;
    weekStart.setDate(weekStart.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const monthStart = new Date(nowLibya.getFullYear(), nowLibya.getMonth(), 1);
    const monthEnd = new Date(nowLibya.getFullYear(), nowLibya.getMonth() + 1, 1);

    const yearStart = new Date(nowLibya.getFullYear(), 0, 1);
    const yearEnd = new Date(nowLibya.getFullYear() + 1, 0, 1);

    let weekCount = 0;
    let monthCount = 0;
    let yearCount = 0;
    sortedOrders.forEach((order) => {
      const created = toLibyaDate(order.created_at);
      if (!created) return;
      if (created >= weekStart && created < weekEnd) weekCount += 1;
      if (created >= monthStart && created < monthEnd) monthCount += 1;
      if (created >= yearStart && created < yearEnd) yearCount += 1;
    });

    return { weekCount, monthCount, yearCount };
  }, [sortedOrders]);

  const createStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      toast.error("اسم المتجر مطلوب");
      return;
    }
    if (!adminCode) {
      toast.error("رمز المنظومة مطلوب");
      return;
    }
    const toastId = toast.loading("جاري إنشاء المتجر...");
    try {
      const res = await fetch(`${API_BASE}/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: storeName, admin_code: adminCode }),
      });
      const data = (await res.json()) as ApiResponse;
      if (data?.store?.id) {
        const created: SavedStore = {
          id: data.store.id,
          name: data.store.name ?? null,
          store_code: data.store.store_code ?? null,
        };
        upsertSavedStore(created);
        applyStoreSelection(created);
        toast.success("تم إنشاء المتجر", { id: toastId });
        setStoreName("");
      } else {
        toast.error(data?.error ?? "فشل إنشاء المتجر", { id: toastId });
      }
    } catch {
      toast.error("خطأ في الشبكة", { id: toastId });
    }
  };

  const createDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminCode) {
      toast.error("رمز المنظومة مطلوب");
      return;
    }
    if (!driverName.trim() || !driverPhone.trim()) {
      toast.error("اسم السائق ورقم الهاتف مطلوبان");
      return;
    }
    const toastId = toast.loading("جاري إنشاء السائق...");

    try {
      const payload: Record<string, unknown> = {
        admin_code: adminCode,
        name: driverName,
        phone: driverPhone,
      };

      const res = await fetch(`${API_BASE}/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Code": adminCode },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as ApiResponse;
      const code = data?.driver?.driver_code ?? data?.driver?.secret_code;
      if (code) {
        setDriverCode(code);
        setDriverName("");
        setDriverPhone("");
        toast.success("تم إنشاء السائق", { id: toastId });
        toast("تم تجهيز صندوق نسخ الكود", { icon: "✨" });
        fetchDrivers();
      } else {
        toast.error(data?.error ?? "فشل إنشاء السائق", { id: toastId });
      }
    } catch {
      toast.error("خطأ في الشبكة", { id: toastId });
    }
  };

  const copyCode = async () => {
    if (!driverCode) return;
    try {
      await navigator.clipboard.writeText(driverCode);
      toast.success("تم نسخ الكود");
    } catch {
      toast.error("تعذر النسخ");
    }
  };

  const fetchDrivers = async () => {
    if (!adminCode) return;
    setDriversLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/drivers?admin_code=${encodeURIComponent(adminCode)}&active=all&limit=500`
      );
      const data = (await res.json()) as ApiResponse;
      if (data?.drivers) {
        const drivers = (data.drivers as DriverRow[]).map((driver) => ({
          ...driver,
          driver_code: (driver as any).driver_code ?? (driver as any).secret_code ?? null,
        }));
        setDrivers(drivers);
      }
    } catch {
      // ignore
    } finally {
      setDriversLoading(false);
    }
  };

  const fetchLedger = async (period = ledgerPeriod) => {
    if (!adminCode || !storeId) return;
    try {
      const [summaryRes, driversRes] = await Promise.all([
        fetch(
          `${API_BASE}/ledger/summary?admin_code=${encodeURIComponent(
            adminCode
          )}&store_id=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}`
        ),
        fetch(
          `${API_BASE}/ledger/drivers?admin_code=${encodeURIComponent(
            adminCode
          )}&store_id=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}`
        ),
      ]);
      const summaryData = (await summaryRes.json()) as ApiResponse;
      const driversData = (await driversRes.json()) as ApiResponse;
      setLedgerSummary((summaryData?.orders ?? []) as LedgerSummaryRow[]);
      setLedgerWallet((summaryData?.wallet ?? []) as LedgerWalletRow[]);
      setLedgerDrivers((driversData?.drivers ?? []) as LedgerDriverRow[]);
    } catch {
      // ignore
    }
  };

  const updateWallet = async (type: "credit" | "debit") => {
    if (!adminCode) {
      toast.error("رمز المنظومة مطلوب");
      return;
    }
    if (!walletDriverId.trim()) {
      toast.error("معرّف السائق مطلوب");
      return;
    }
    const amountValue = Number(walletAmount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      toast.error("أدخل مبلغاً صحيحاً");
      return;
    }

    const toastId = toast.loading(
      type === "credit" ? "جاري شحن المحفظة..." : "جاري سحب المبلغ..."
    );

    try {
      const res = await fetch(
        `${API_BASE}/drivers/${encodeURIComponent(
          walletDriverId
        )}/wallet/${type}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Admin-Code": adminCode },
          body: JSON.stringify({
            admin_code: adminCode,
            amount: amountValue,
            method: walletMethod,
            note: walletNote,
          }),
        }
      );
      const data = (await res.json()) as ApiResponse;
      if (data?.ok) {
        toast.success("تم تحديث المحفظة", { id: toastId });
        setWalletAmount("");
        setWalletNote("");
        fetchLedger(ledgerPeriod);
      } else {
        toast.error(data?.error ?? "فشل تحديث المحفظة", { id: toastId });
      }
    } catch {
      toast.error("خطأ في الشبكة", { id: toastId });
    }
  };

  const setDriverActive = async (driverId: string, nextActive: boolean) => {
    if (!adminCode) {
      toast.error("رمز المنظومة مطلوب");
      return;
    }
    if (!driverId) return;
    const confirmed = window.confirm(
      nextActive
        ? "سيتم تفعيل السائق للعودة للعمل. هل تريد المتابعة؟"
        : "سيتم تعطيل السائق وإيقاف ظهوره في القائمة النشطة. هل تريد المتابعة؟"
    );
    if (!confirmed) return;

    const toastId = toast.loading(
      nextActive ? "جاري تفعيل السائق..." : "جاري تعطيل السائق..."
    );
    try {
      const res = await fetch(
        `${API_BASE}/drivers/${encodeURIComponent(driverId)}/active`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "X-Admin-Code": adminCode },
          body: JSON.stringify({ admin_code: adminCode, active: nextActive ? 1 : 0 }),
        }
      );
      const data = (await res.json()) as ApiResponse;
      if (data?.ok) {
        toast.success(nextActive ? "تم تفعيل السائق" : "تم تعطيل السائق", {
          id: toastId,
        });
        fetchDrivers();
      } else {
        toast.error(data?.error ?? "فشل تحديث السائق", { id: toastId });
      }
    } catch {
      toast.error("خطأ في الشبكة", { id: toastId });
    }
  };

  const reopenOrder = async (orderId: string) => {
    if (!adminCode) {
      toast.error("رمز المنظومة مطلوب");
      return;
    }
    const confirmed = window.confirm("سيتم إعادة الطلب إلى حالة الانتظار. هل تريد المتابعة؟");
    if (!confirmed) return;

    const toastId = toast.loading("جاري إعادة تفعيل الطلب...");
    try {
      const res = await fetch(`${API_BASE}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "X-Admin-Code": adminCode },
        body: JSON.stringify({
          admin_code: adminCode,
          store_id: storeId || undefined,
          status: "pending",
        }),
      });
      const data = (await res.json()) as ApiResponse;
      if (data?.ok) {
        toast.success("تمت إعادة الطلب", { id: toastId });
        refreshOrders(true);
      } else {
        toast.error(data?.error ?? "تعذر إعادة الطلب", { id: toastId });
      }
    } catch {
      toast.error("خطأ في الشبكة", { id: toastId });
    }
  };

  const createOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const adminForOrder = adminCode;
    if (!adminForOrder) {
      toast.error("رمز المنظومة مطلوب");
      return;
    }
    const storeForOrder = orderStoreId;
    if (!storeForOrder) {
      toast.error("اختر متجرًا أولاً");
      return;
    }
    const toastId = toast.loading("جاري إنشاء الطلب...");

    const formData = new FormData(e.currentTarget);
    const receiverName = formData.get("receiver_name");
    const payload: Record<string, unknown> = {
      admin_code: adminForOrder,
      customer_name: receiverName,
      customer_location_text: formData.get("customer_location_text"),
      order_type: formData.get("order_type"),
      receiver_name: receiverName,
      payout_method: formData.get("payout_method"),
      price: formData.get("total_amount"),
      delivery_fee: 0,
    };
    pendingCreateRef.current = {
      receiverName: receiverName ? String(receiverName).trim() : null,
      location: String(formData.get("customer_location_text") ?? "").trim() || null,
      orderType: String(formData.get("order_type") ?? "").trim() || null,
      price: Number(formData.get("total_amount") ?? 0) || 0,
      expiresAt: Date.now() + 15000,
    };
    const driverCode = String(formData.get("driver_code") ?? "").trim();
    if (driverCode) payload.driver_code = driverCode;

    payload.store_id = storeForOrder;

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as ApiResponse;
      if (data?.order?.id) {
        e.currentTarget.reset();
        toast.success("تم إنشاء الطلب", { id: toastId });
        if (availableStores.length > 1) {
          setOrderStoreId("");
        }
        refreshOrders(true);
      } else {
        toast.error(data?.error ?? "فشل إنشاء الطلب", { id: toastId });
        refreshOrders(true);
      }
    } catch {
      toast("تم إرسال الطلب، جارٍ التأكيد...", { id: toastId, icon: "⏳" });
      refreshOrders(true);
    }
  };

  useEffect(() => {
    if (activeSection === "finance") {
      fetchLedger(ledgerPeriod);
    }
  }, [activeSection, ledgerPeriod]);

  if (!isAuthed) {
    return (
      <div dir="rtl" className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-orange-50 text-slate-900">
        <Toaster position="top-right" />
        <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
          <div className="rounded-3xl border border-white/70 bg-white/80 p-6 text-center shadow-[0_20px_40px_-24px_rgba(15,23,42,0.35)] backdrop-blur">
            <img src="/logo.webp" alt="Nova Max" className="mx-auto h-16 w-16 rounded-2xl border border-slate-200 bg-white" />
            <h1 className="mt-4 text-2xl font-semibold">Nova Max</h1>
            <p className="mt-2 text-sm text-slate-500">أدخل رمز المنظومة للمتابعة.</p>
            <input
              className="mt-6 h-11 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-orange-400"
              placeholder="رمز المنظومة"
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
            />
            <button
              type="button"
              onClick={() => fetchStores(false)}
              className="mt-4 h-11 w-full rounded-xl bg-orange-500 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={authChecking || !adminCode.trim()}
            >
              {authChecking ? "جارٍ التحقق..." : "دخول المنظومة"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-cyan-50 via-white to-orange-50 text-slate-900">
      <Toaster position="top-right" />
      <div className="w-full px-6 py-10">
        <header className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white">
              <img
                src="/logo.webp"
                alt="Nova"
                className="h-14 w-14 rounded-2xl border border-slate-200 bg-white"
              />
            </div>
            <div>
              <p className="text-xs tracking-[0.25em] text-slate-500">
                لوحة التحكم اللوجستية
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                Nova Max Logistics
              </h1>
            </div>
          </div>
          <div className="flex flex-col gap-3 md:items-end">
            <div className="grid grid-cols-2 gap-3 text-xs md:flex md:items-center">
              <div className="rounded-full border border-white/70 bg-white/80 px-4 py-2">
                الإجمالي <span className="ml-2 font-semibold">{stats.total}</span>
              </div>
              <div className="rounded-full border border-white/70 bg-white/80 px-4 py-2">
                قيد الانتظار{" "}
                <span className="ml-2 font-semibold">{stats.pending}</span>
              </div>
              <div className="rounded-full border border-white/70 bg-white/80 px-4 py-2">
                قيد التوصيل{" "}
                <span className="ml-2 font-semibold">{stats.delivering}</span>
              </div>
              <div className="rounded-full border border-white/70 bg-white/80 px-4 py-2">
                تم التسليم{" "}
                <span className="ml-2 font-semibold">{stats.delivered}</span>
              </div>
              <div className="rounded-full border border-white/70 bg-white/80 px-4 py-2">
                الاتصال{" "}
                <span
                  className={`ml-2 font-semibold ${
                    realtimeStatus === "connected"
                      ? "text-emerald-600"
                      : realtimeStatus === "connecting"
                      ? "text-orange-500"
                      : "text-rose-500"
                  }`}
                >
                  {realtimeStatus === "connected"
                    ? "متصل"
                    : realtimeStatus === "connecting"
                    ? "جارٍ الاتصال"
                    : "منقطع"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={logoutAdmin}
              className="h-10 rounded-full border border-orange-200 bg-white/80 px-4 text-xs font-semibold text-orange-600 transition hover:border-orange-300"
            >
              تسجيل الخروج
            </button>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_260px]">
          <main className="order-2 space-y-6 lg:order-1">
            <div className="flex gap-2 overflow-x-auto pb-2 text-xs font-semibold lg:hidden">
              {sectionNav.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => goToSection(item.key)}
                  className={`${navButtonBase} whitespace-nowrap ${
                    activeSection === item.key
                      ? navButtonActive
                      : navButtonInactive
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
            </div>
            {activeSection === "dashboard" && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">لوحة التحكم</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      ملخص سريع لأهم مؤشرات التشغيل.
                    </p>
                  </div>
                  <LayoutDashboard className="h-5 w-5 text-slate-500" />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">المتجر</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {storeLabel ?? "غير محدد"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      المعرّف: {storeId || "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">السائقون النشطون</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {activeDriversCount}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      متصل الآن: {onlineDriversCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">إجمالي الطلبات</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {stats.total}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      قيد التوصيل: {stats.delivering}
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-sm font-semibold text-slate-800">آخر الطلبات</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="text-xs text-slate-500">
  <tr>
    <th className="py-2">الرقم</th>
    <th>العميل</th>
    <th>النوع</th>
    <th>الحالة</th>
    <th className="text-left">الإجمالي</th>
  </tr>
</thead>

                      <tbody className="divide-y divide-slate-200">
                        {recentOrders.map((order) => (
                          <tr key={order.id}>
                            <td
                              className="py-3 font-semibold text-slate-900"
                              title={order.id}
                            >
                              #{formatOrderNumber(order.id)}
                            </td>
                            <td className="text-slate-700">
                              {order.customer_name ?? "-"}
                            </td>
                            <td className="text-slate-700">
                              {order.order_type ?? "-"}
                            </td>
                            <td>
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${
                                  statusStyles[order.status ?? ""] ??
                                  "border-slate-200 bg-slate-100 text-slate-700"
                                }`}
                              >
                                {formatStatus(order.status)}
                              </span>
                            </td>
                            <td className="text-left text-slate-700">
                              {formatOrderTotal(order)}
                            </td>
                          </tr>
                        ))}
                        {recentOrders.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-500">
                              لا توجد طلبات حالياً.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            )}

            {activeSection === "settings" && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">قائمة المتاجر</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      إدارة المتاجر وربطها عبر رمز المنظومة الموحد.
                    </p>
                  </div>
                  <Settings className="h-5 w-5 text-slate-500" />
                </div>
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">رمز المنظومة</p>
                    <button
                      type="button"
                      onClick={() => fetchStores(false)}
                      className="inline-flex items-center gap-2 text-xs text-slate-500"
                    >
                      <RefreshCw className="h-4 w-4" />
                      تحديث القائمة
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <input
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-orange-400"
                      placeholder="رمز المنظومة"
                      value={adminCode}
                      onChange={(e) => setAdminCode(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => fetchStores(false)}
                      className="h-11 rounded-lg bg-orange-500 text-sm font-semibold text-white transition hover:bg-orange-600"
                    >
                      تحديث
                    </button>
                  </div>
                  {savedStores.length > 0 ? (
                    <div className="mt-4">
                      <label className="mb-1 block text-xs font-semibold text-slate-500">
                        اختر المتجر للعمل عليه
                      </label>
                      <select
                        value={storeId}
                        onChange={(e) => {
                          const selected = savedStores.find(
                            (item) => item.id === e.target.value
                          );
                          applyStoreSelection(selected ?? null);
                          refreshOrders(true);
                          fetchDrivers();
                        }}
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-orange-400"
                      >
                        <option value="">اختر متجرًا</option>
                        {savedStores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name ?? "متجر"} • {store.store_code ?? "-"}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      لا توجد متاجر بعد. يمكنك إنشاء متجر جديد بالأسفل.
                    </div>
                  )}
                  <form onSubmit={createStore} className="mt-4 grid gap-3 md:grid-cols-2">
                    <input
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="اسم المتجر الجديد"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      className="h-11 rounded-lg bg-orange-500 text-sm font-semibold text-white transition hover:bg-orange-600"
                    >
                      إنشاء متجر
                    </button>
                  </form>
                  <div className="mt-4 grid gap-3 md:grid-cols-2 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                      <p className="text-slate-500">المتجر</p>
                      <p className="mt-1 font-semibold text-slate-900">{storeLabel ?? "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                      <p className="text-slate-500">كود المتجر</p>
                      <p className="mt-1 font-semibold text-slate-900">{storeCode || "-"}</p>
                    </div>
                  </div>
                  <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                    <p className="font-semibold">حذف المتجر (نهائي)</p>
                    <p className="mt-1">
                      سيتم حذف المتجر وجميع الطلبات والسائقين المرتبطين به.
                    </p>
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-semibold text-rose-700">
                        اختر المتجر المراد حذفه
                      </label>
                      <select
                        value={deleteStoreId}
                        onChange={(e) => setDeleteStoreId(e.target.value)}
                        className="h-11 w-full rounded-lg border border-rose-200 bg-white px-3 text-sm text-rose-900 outline-none focus:border-rose-400"
                      >
                        <option value="">اختر متجرًا للحذف</option>
                        {savedStores.map((store) => (
                          <option key={`del-${store.id}`} value={store.id}>
                            {store.name ?? "متجر"} • {store.store_code ?? "-"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={deleteStore}
                      disabled={!adminCode || !deleteStoreId}
                      className={`mt-3 inline-flex h-11 items-center rounded-lg px-5 text-sm font-semibold transition ${
                        adminCode && deleteStoreId
                          ? "bg-rose-600 text-white hover:bg-rose-700"
                          : "cursor-not-allowed bg-rose-200 text-rose-400"
                      }`}
                    >
                      حذف المتجر الآن
                    </button>
                    {!deleteStoreId && (
                      <p className="mt-2 text-xs text-rose-700">
                        اختر متجرًا من القائمة لإكمال عملية الحذف.
                      </p>
                    )}
                  </div>
                </div>
              </section>
            )}

            {activeSection === "drivers" && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">السائقون</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      إنشاء الحسابات وإدارة حالة المندوبين (الحساب عام ويعمل مع أي متجر).
                    </p>
                  </div>
                  <Users className="h-5 w-5 text-slate-500" />
                </div>
                <form onSubmit={createDriver} className="mt-5 grid gap-3 md:grid-cols-2">
                  <input
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="اسم المستخدم"
                    value={driverName}
                    onChange={(e) => setDriverName(e.target.value)}
                    required
                  />
                  <input
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="رقم الهاتف"
                    value={driverPhone}
                    onChange={(e) => setDriverPhone(e.target.value)}
                    required
                  />
                  <button
                    type="submit"
                    className="h-11 rounded-lg bg-orange-500 text-sm font-semibold text-white transition hover:bg-orange-600 md:col-span-2"
                  >
                    توليد كود السائق
                  </button>
                </form>

                {driverCode && (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">كود السائق الحالي</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xl font-semibold text-slate-900">
                        {driverCode}
                      </span>
                      <button
                        onClick={copyCode}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-700 transition hover:border-slate-400"
                        type="button"
                      >
                        <Copy className="h-4 w-4" />
                        نسخ
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">قائمة السائقين</p>
                    <button
                      type="button"
                      onClick={fetchDrivers}
                      className="inline-flex items-center gap-2 text-xs text-slate-500"
                    >
                      <RefreshCw className="h-4 w-4" />
                      تحديث
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {driversLoading && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-slate-500">
                        جاري تحميل السائقين...
                      </div>
                    )}
                    {!driversLoading && sortedDrivers.length == 0 && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-slate-500">
                        {adminCode ? "لا يوجد سائقون بعد." : "أدخل كود الإدارة لعرض السائقين."}
                      </div>
                    )}
                    {sortedDrivers.map((driver) => {
                      const isActive = driver.is_active != 0;
                      const statusLabel = driver.status == "online" ? "متصل" : "غير متصل";
                      return (
                        <div
                          key={driver.id}
                          className="flex flex-col gap-3 rounded-lg border border-slate-200 px-3 py-3 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {driver.name ?? "سائق جديد"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {driver.phone ?? "-"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              كود السائق: {driver.driver_code ?? "-"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-slate-700">
                              {statusLabel}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-700">
                              {isActive ? "مفعل" : "معطل"}
                            </span>
                            <button
                              type="button"
                              onClick={() => setDriverActive(driver.id, !isActive)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                isActive
                                  ? "border border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                                  : "bg-orange-500 text-white hover:bg-orange-600"
                              }`}
                            >
                              {isActive ? "تعطيل" : "تفعيل"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </section>
            )}

            {activeSection === "finance" && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">العمليات المالية</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      إدارة حركات المحفظة والتحويلات المالية.
                    </p>
                  </div>
                  <Wallet className="h-5 w-5 text-slate-500" />
                </div>

                {!adminCode && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    أدخل كود الإدارة لفتح لوحة المالية.
                  </div>
                )}

                {adminCode && (
                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        شحن محفظة السائق
                      </p>
                      <div className="mt-4 grid gap-3">
                        <input
                          className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                          placeholder="معرّف السائق"
                          value={walletDriverId}
                          onChange={(e) => setWalletDriverId(e.target.value)}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                          placeholder="المبلغ"
                          value={walletAmount}
                          onChange={(e) => setWalletAmount(e.target.value)}
                        />
                        <select
                          className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                          value={walletMethod}
                          onChange={(e) => setWalletMethod(e.target.value)}
                        >
                          <option value="wallet">محفظة محلية</option>
                          <option value="cash">كاش</option>
                        </select>
                        <input
                          className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                          placeholder="ملاحظة (اختياري)"
                          value={walletNote}
                          onChange={(e) => setWalletNote(e.target.value)}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => updateWallet("credit")}
                            className="h-11 rounded-lg bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600"
                          >
                            إضافة رصيد
                          </button>
                          <button
                            type="button"
                            onClick={() => updateWallet("debit")}
                            className="h-11 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-slate-400"
                          >
                            سحب رصيد
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">
                          حماية العمليات المالية
                        </p>
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                          value={ledgerPeriod}
                          onChange={(e) => setLedgerPeriod(e.target.value)}
                        >
                          <option value="daily">يومي</option>
                          <option value="weekly">أسبوعي</option>
                          <option value="monthly">شهري</option>
                        </select>
                      </div>

                      <div className="mt-4 grid gap-4 text-sm">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">إجمالي التوصيل</p>
                          {ledgerSummary.slice(0, 4).map((row) => (
                            <div
                              key={`orders-${row.period}`}
                              className="mt-2 flex items-center justify-between text-xs"
                            >
                              <span>{row.period}</span>
                              <span className="font-semibold">
                                {Number(row.delivery_total || 0).toFixed(2)}
                              </span>
                            </div>
                          ))}
                          {ledgerSummary.length == 0 && (
                            <p className="mt-2 text-xs text-slate-500">لا توجد بيانات بعد.</p>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">حركات المحفظة</p>
                          {ledgerWallet.slice(0, 4).map((row) => (
                            <div
                              key={`wallet-${row.period}`}
                              className="mt-2 flex items-center justify-between text-xs"
                            >
                              <span>{row.period}</span>
                              <span className="font-semibold">
                                {Number(row.credits || 0).toFixed(2)} / {Number(row.debits || 0).toFixed(2)}
                              </span>
                            </div>
                          ))}
                          {ledgerWallet.length == 0 && (
                            <p className="mt-2 text-xs text-slate-500">لا توجد بيانات بعد.</p>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">أداء السائقين</p>
                          {ledgerDrivers.slice(0, 4).map((row) => (
                            <div
                              key={`driver-${row.driver_id}-${row.period}`}
                              className="mt-2 flex items-center justify-between text-xs"
                            >
                              <span>{row.driver_name ?? formatDriverDisplay(row.driver_id)}</span>
                              <span className="font-semibold">
                                {Number(row.delivery_total || 0).toFixed(2)}
                              </span>
                            </div>
                          ))}
                          {ledgerDrivers.length == 0 && (
                            <p className="mt-2 text-xs text-slate-500">لا توجد بيانات بعد.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {activeSection === "create_order" && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <PackagePlus className="h-5 w-5 text-slate-600" />
                  إنشاء طلب
                </div>
                {!canCreateOrder && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    اختر متجرًا من قائمة المتاجر لتفعيل إنشاء الطلبات.
                  </div>
                )}
                <form onSubmit={createOrder} className="mt-5 grid gap-3 md:grid-cols-2">
                  {availableStores.length > 0 ? (
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-slate-500">
                        المتجر المطلوب للطلب
                      </label>
                      <select
                        className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                        value={orderStoreId || ""}
                        onChange={(e) => {
                          const nextId = e.target.value;
                          setOrderStoreId(nextId);
                        }}
                        required
                      >
                        <option value="" disabled>
                          اختر متجرًا للطلب
                        </option>
                        {availableStores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name ?? store.id.slice(0, 6)}
                          </option>
                        ))}
                      </select>
                      {selectedOrderStore && (
                        <p className="mt-1 text-xs text-slate-500">
                          كود المتجر: {selectedOrderStore.store_code ?? "-"}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      لا توجد متاجر بعد. اذهب إلى قائمة المتاجر لإنشاء متجر جديد.
                    </div>
                  )}
                  <input
                    name="receiver_name"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="اسم المستلم"
                    required
                  />
                  <input
                    name="customer_location_text"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="عنوان المستلم"
                    required
                  />
                  <input
                    name="order_type"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="نوع الطلب"
                    required
                  />
                  <input
                    name="total_amount"
                    type="number"
                    step="0.01"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="الإجمالي"
                  />
                  <select
                    name="payout_method"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    defaultValue=""
                    required
                  >
                    <option value="" disabled>
                      اختر طريقة الدفع
                    </option>
                    <option value="wallet">محفظة محلية</option>
                    <option value="cash">كاش</option>
                  </select>
                  <input
                    name="driver_code"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400 md:col-span-2"
                    placeholder="كود السائق (اختياري - اتركه فارغًا للتوزيع على الكل)"
                  />
                  <button
                    disabled={!canCreateOrder}
                    className={`h-11 rounded-lg text-sm font-semibold text-white transition md:col-span-2 ${
                      canCreateOrder
                        ? "bg-orange-500 hover:bg-orange-600"
                        : "cursor-not-allowed bg-slate-300 text-slate-600"
                    }`}
                  >
                    إنشاء الطلب
                  </button>
                </form>
              </section>
            )}

            {activeSection === "orders" && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-lg font-semibold">قائمة الطلبات</p>
                  <button
                    type="button"
                    onClick={() => refreshOrders(true)}
                    className="inline-flex items-center gap-2 text-xs text-slate-500"
                  >
                    <RefreshCw className="h-4 w-4" />
                    تحديث
                  </button>
                </div>
                {!storeId && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    اختر متجرًا من قائمة المتاجر لعرض الطلبات.
                  </div>
                )}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="py-2">الرقم</th>
                        <th>العميل</th>
                        <th>المستلم</th>
                        <th>النوع</th>
                        <th>السائق</th>
                        <th>الحالة</th>
                        <th>الدفع</th>
                        <th className="text-left">الإجمالي</th>
                        <th className="text-left">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {sortedOrders.map((order) => (
                        <tr
                          key={order.id}
                          className={`${
                            flashIds.has(order.id) ? "bg-orange-50" : "bg-transparent"
                          }`}
                        >
                          <td
                            className="py-3 font-semibold text-slate-900"
                            title={order.id}
                          >
                            #{formatOrderNumber(order.id)}
                          </td>
                          <td className="text-slate-700">
                            {order.customer_name ?? "-"}
                          </td>
                          <td className="text-slate-700">
                            {order.receiver_name ?? "-"}
                          </td>
                          <td className="text-slate-700">
                            {order.order_type ?? "-"}
                          </td>
                          <td className="text-slate-500" title={order.driver_id ?? undefined}>
                            {formatDriverDisplay(order.driver_id)}
                          </td>
                          <td>
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium ${
                                statusStyles[order.status ?? ""] ??
                                "border-slate-200 bg-slate-100 text-slate-700"
                              }`}
                            >
                              {formatStatus(order.status)}
                            </span>
                          </td>
                          <td className="text-slate-700">
                            {formatPayout(order.payout_method)}
                          </td>
                          <td className="text-left text-slate-700">
                            {formatOrderTotal(order)}
                          </td>
                          <td className="text-left">
                            {order.status === "cancelled" && (
                              <button
                                type="button"
                                onClick={() => reopenOrder(order.id)}
                                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
                              >
                                إعادة
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {sortedOrders.length == 0 && (
                        <tr>
                          <td colSpan={9} className="py-6 text-center text-slate-500">
                            {storeId
                              ? "لا توجد طلبات حالياً."
                              : "اختر متجرًا من قائمة المتاجر لعرض الطلبات."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {activeSection === "inventory" && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <ListOrdered className="h-5 w-5 text-slate-600" />
                  الجرد الداخلي
                </div>
                {!storeId && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    اختر متجرًا من قائمة المتاجر لعرض الجرد.
                  </div>
                )}
                {storeId && (
                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-xs text-slate-500">
                        إجمالي هذا الأسبوع (السبت → السبت)
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {inventorySummary.weekCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-xs text-slate-500">إجمالي هذا الشهر</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {inventorySummary.monthCount}
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4">
                      <p className="text-xs text-slate-500">إجمالي هذا العام</p>
                      <p className="mt-2 text-2xl font-semibold text-slate-900">
                        {inventorySummary.yearCount}
                      </p>
                    </div>
                  </div>
                )}
              </section>
            )}
      </main>

      <aside className="order-1 lg:order-2">
        <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm lg:sticky lg:top-6">
          <p className="text-xs tracking-[0.25em] text-slate-400">الأقسام</p>
          <div className="mt-4 grid gap-2">
            {sectionNav.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => goToSection(item.key)}
                className={`${navButtonBase} ${
                  activeSection === item.key ? navButtonActive : navButtonInactive
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={logoutAdmin}
            className="mt-6 flex w-full items-center justify-between rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-800"
          >
            تسجيل الخروج
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>
    </div>
  </div>
  </div>
  );
}






















