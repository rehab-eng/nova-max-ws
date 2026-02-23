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
  ShieldCheck,
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
  admin_code: string;
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
  { key: "settings", label: "الإعدادات", icon: Settings },
];

const navButtonBase =
  "w-full rounded-md px-3 py-2 text-sm font-semibold transition flex items-center justify-between text-right";
const navButtonActive = "bg-slate-800 text-white";
const navButtonInactive = "text-slate-300 hover:bg-slate-800/60";

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
  card: "بطاقة مصرفية",
  wallet: "محفظة",
  cash: "كاش",
  bank_transfer: "حوالة مصرفية",
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

const canUseWebAuthn = () =>
  typeof window !== "undefined" &&
  window.isSecureContext &&
  "PublicKeyCredential" in window;

const bufferToBase64Url = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const base64UrlToBuffer = (base64Url: string) => {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

const randomChallenge = (size = 32) => {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
};

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
  const [storeName, setStoreName] = useState("");
  const [storeLabel, setStoreLabel] = useState<string | null>(null);
  const [savedStores, setSavedStores] = useState<SavedStore[]>([]);
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverCode, setDriverCode] = useState<string | null>(null);
  const [driverSearch, setDriverSearch] = useState("");
  const [driverMatches, setDriverMatches] = useState<DriverRow[]>([]);
  const [driverSearchLoading, setDriverSearchLoading] = useState(false);
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
  const [inventoryQuery, setInventoryQuery] = useState("");
  const [inventoryStatus, setInventoryStatus] = useState("all");
  const [inventoryRange, setInventoryRange] = useState("30");
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLinked, setBiometricLinked] = useState(false);
  const [financeUnlocked, setFinanceUnlocked] = useState(false);

  const ordersRef = useRef<Order[]>([]);
  const hasLoadedRef = useRef(false);
  const flashTimers = useRef<Map<string, number>>(new Map());

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

  useEffect(() => {
    localStorage.setItem("nova.stores", JSON.stringify(savedStores));
  }, [savedStores]);

  useEffect(() => {
    localStorage.setItem("nova.store_id", storeId);
  }, [storeId]);

  useEffect(() => {
    localStorage.setItem("nova.store_code", storeCode);
  }, [storeCode]);

  useEffect(() => {
    localStorage.setItem("nova.admin_code", adminCode);
  }, [adminCode]);

  useEffect(() => {
    setBiometricSupported(canUseWebAuthn());
  }, []);

  useEffect(() => {
    const key = getAdminBiometricKey();
    if (!key) {
      setBiometricLinked(false);
      return;
    }
    setBiometricLinked(!!localStorage.getItem(key));
  }, [adminCode]);

  useEffect(() => {
    setFinanceUnlocked(false);
  }, [adminCode]);

  useEffect(() => {
    let active = true;
    const query = driverSearch.trim();

    if (!adminCode || query.length < 2) {
      setDriverMatches([]);
      setDriverSearchLoading(false);
      return;
    }

    setDriverSearchLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE}/drivers/search?admin_code=${encodeURIComponent(
            adminCode
          )}&query=${encodeURIComponent(query)}&online=1`
        );
        const data = (await res.json()) as ApiResponse;
        if (!active) return;
        setDriverMatches((data?.drivers ?? []) as DriverRow[]);
      } catch {
        if (active) setDriverMatches([]);
      } finally {
        if (active) setDriverSearchLoading(false);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(handle);
    };
  }, [driverSearch, adminCode]);

  const clearStore = () => {
    localStorage.removeItem("nova.store_id");
    localStorage.removeItem("nova.store_code");
    localStorage.removeItem("nova.admin_code");
    setStoreId("");
    setStoreCode("");
    setAdminCode("");
    setStoreLabel(null);
    setFinanceUnlocked(false);
  };

  const getAdminBiometricKey = () => {
    if (!adminCode.trim()) return null;
    return `nova.admin.webauthn.${adminCode.trim()}`;
  };

  const upsertSavedStore = (store: SavedStore) => {
    setSavedStores((prev) => {
      const next = prev.filter((item) => item.id !== store.id);
      return [store, ...next].slice(0, 12);
    });
  };

  const selectSavedStore = (store: SavedStore) => {
    setStoreId(store.id);
    setStoreLabel(store.name ?? null);
    setStoreCode(store.store_code ?? "");
    setAdminCode(store.admin_code ?? "");
  };

  const ensureFinanceAccess = async () => {
    if (!canUseWebAuthn()) return true;
    const key = getAdminBiometricKey();
    if (!key) return false;
    const stored = localStorage.getItem(key);
    if (!stored) return false;
    try {
      await navigator.credentials.get({
        publicKey: {
          challenge: randomChallenge(),
          timeout: 60000,
          userVerification: "required",
          allowCredentials: [
            {
              id: base64UrlToBuffer(stored),
              type: "public-key",
            },
          ],
        },
      });
      return true;
    } catch {
      toast.error("فشل التحقق بالبصمة.");
      return false;
    }
  };

  const registerFinanceBiometric = async () => {
    if (!canUseWebAuthn()) return false;
    const key = getAdminBiometricKey();
    if (!key || localStorage.getItem(key)) return true;
    try {
      const userId = new TextEncoder().encode(`admin:${adminCode}`);
      const credential = (await navigator.credentials.create({
        publicKey: {
          challenge: randomChallenge(),
          rp: { name: "Nova Max WS" },
          user: {
            id: userId,
            name: adminCode,
            displayName: "Admin",
          },
          pubKeyCredParams: [
            { type: "public-key", alg: -7 },
            { type: "public-key", alg: -257 },
          ],
          authenticatorSelection: {
            residentKey: "preferred",
            userVerification: "required",
          },
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;
      if (credential?.rawId) {
        localStorage.setItem(key, bufferToBase64Url(credential.rawId));
        setBiometricLinked(true);
        return true;
      }
    } catch {
      toast.error("تعذر تفعيل البصمة.");
    }
    return false;
  };

  const goToSection = async (section: SectionKey) => {
    if (section === "finance") {
      const ok = await ensureFinanceAccess();
      if (!ok) {
        setFinanceUnlocked(false);
        setActiveSection(section);
        return;
      }
      setFinanceUnlocked(true);
    }
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

  const resolveStore = async (silent = true) => {
    if (!adminCode) return;
    const toastId = silent ? null : toast.loading("جاري ربط المتجر...");
    try {
      const res = await fetch(`${API_BASE}/stores/by-admin`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Code": adminCode },
        body: JSON.stringify({ admin_code: adminCode }),
      });
      const data = (await res.json()) as ApiResponse;
      if (data?.store?.id) {
        setStoreId(data.store.id);
        setStoreLabel(data.store.name ?? null);
        setStoreCode(data.store.store_code ?? "");
        if (data.store.admin_code) setAdminCode(data.store.admin_code);
        upsertSavedStore({
          id: data.store.id,
          name: data.store.name ?? null,
          admin_code: data.store.admin_code ?? adminCode,
          store_code: data.store.store_code ?? null,
        });
        if (toastId) toast.success("تم ربط المتجر", { id: toastId });
      } else if (toastId) {
        toast.error(data?.error ?? "تعذر ربط المتجر", { id: toastId });
      }
    } catch {
      if (toastId) toast.error("خطأ في الشبكة", { id: toastId });
    }
  };

  useEffect(() => {
    if (adminCode && !storeId) {
      resolveStore(true);
    }
  }, [adminCode, storeId]);

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

  const applyOrders = (nextOrders: Order[], showToasts: boolean) => {
    const prev = ordersRef.current;
    const prevMap = new Map(prev.map((order) => [order.id, order]));

    if (showToasts) {
      for (const order of nextOrders) {
        const previous = prevMap.get(order.id);
        if (!previous) {
          toast.success(`طلب جديد ${order.id.slice(0, 6)}...`);
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
                    حالة الطلب {order.id.slice(0, 6)}... أصبحت{" "}
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

    ordersRef.current = nextOrders;
    setOrders(nextOrders);
  };

  const refreshOrders = async (showToasts = false) => {
    if (!storeId && !adminCode) return;
    const query = storeId
      ? `store_id=${encodeURIComponent(storeId)}`
      : `admin_code=${encodeURIComponent(adminCode)}`;
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
    if (!storeId && !adminCode) return;
    let active = true;
    let source: EventSource | null = null;
    let socket: WebSocket | null = null;
    let pingTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let retry = 0;
    const query = storeId
      ? `store_id=${encodeURIComponent(storeId)}`
      : `admin_code=${encodeURIComponent(adminCode)}`;

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
        upsertOrder(payload.order as Order);
        return;
      }
      if (type === "order_status" && typeof payload.order_id === "string") {
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
        toast("تم تحديث حالة السائق");
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
      const wsUrl = buildWsUrl("/realtime", {
        role: "admin",
        admin_code: adminCode,
      });
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        retry = 0;
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

  const inventoryOrders = useMemo(() => {
    const query = inventoryQuery.trim().toLowerCase();
    const range = inventoryRange === "all" ? null : Number(inventoryRange);
    const cutoff = range ? Date.now() - range * 86400000 : null;

    return sortedOrders.filter((order) => {
      if (inventoryStatus !== "all" && order.status !== inventoryStatus) {
        return false;
      }
      if (cutoff && order.created_at) {
        const time = new Date(order.created_at).getTime();
        if (!Number.isNaN(time) && time < cutoff) return false;
      }
      if (query) {
        const hay = [
          order.customer_name,
          order.receiver_name,
          order.order_type,
          order.driver_id,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });
  }, [sortedOrders, inventoryQuery, inventoryStatus, inventoryRange]);

  const createStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!storeName.trim()) {
      toast.error("اسم المتجر مطلوب");
      return;
    }
    const toastId = toast.loading("جاري إنشاء المتجر...");
    try {
      const res = await fetch(`${API_BASE}/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: storeName }),
      });
      const data = (await res.json()) as ApiResponse;
      if (data?.store?.id) {
        setStoreId(data.store.id);
        setStoreCode(data.store.store_code ?? "");
        setAdminCode(data.store.admin_code ?? "");
        setStoreLabel(data.store.name ?? null);
        upsertSavedStore({
          id: data.store.id,
          name: data.store.name ?? null,
          admin_code: data.store.admin_code ?? "",
          store_code: data.store.store_code ?? null,
        });
        toast.success("تم إنشاء المتجر", { id: toastId });
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
      toast.error("رمز الإدارة مطلوب");
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
      if (storeId) payload.store_id = storeId;

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
        `${API_BASE}/drivers?admin_code=${encodeURIComponent(adminCode)}&active=all`
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
    if (!adminCode) return;
    try {
      const [summaryRes, driversRes] = await Promise.all([
        fetch(
          `${API_BASE}/ledger/summary?admin_code=${encodeURIComponent(
            adminCode
          )}&period=${encodeURIComponent(period)}`
        ),
        fetch(
          `${API_BASE}/ledger/drivers?admin_code=${encodeURIComponent(
            adminCode
          )}&period=${encodeURIComponent(period)}`
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
      toast.error("رمز الإدارة مطلوب");
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
      toast.error("رمز الإدارة مطلوب");
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
      toast.error("رمز الإدارة مطلوب");
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
    if (!adminCode) {
      toast.error("رمز الإدارة مطلوب");
      return;
    }
    const toastId = toast.loading("جاري إنشاء الطلب...");

    const formData = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = {
      admin_code: adminCode,
      customer_name: formData.get("customer_name"),
      customer_location_text: formData.get("customer_location_text"),
      order_type: formData.get("order_type"),
      receiver_name: formData.get("receiver_name"),
      payout_method: formData.get("payout_method"),
      price: formData.get("price"),
      delivery_fee: formData.get("delivery_fee"),
    };
    const driverCode = String(formData.get("driver_code") ?? "").trim();
    if (driverCode) payload.driver_code = driverCode;

    if (storeId) payload.store_id = storeId;

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await res.json()) as ApiResponse;
      if (data?.order?.id) {
        e.currentTarget.reset();
        setDriverSearch("");
        setDriverMatches([]);
        toast.success("تم إنشاء الطلب", { id: toastId });
      } else {
        toast.error(data?.error ?? "فشل إنشاء الطلب", { id: toastId });
      }
    } catch {
      toast.error("خطأ في الشبكة", { id: toastId });
    }
  };

  useEffect(() => {
    if (!adminCode) return;
    fetchDrivers();
    fetchLedger(ledgerPeriod);
  }, [adminCode]);

  useEffect(() => {
    if (activeSection === "finance") {
      fetchLedger(ledgerPeriod);
    }
  }, [activeSection, ledgerPeriod]);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
      <Toaster position="top-right" />
      <div className="w-full px-6 py-10">
        <header className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-[11px] font-semibold tracking-[0.2em] text-slate-500">NOVA</div>
            </div>
            <div>
              <p className="text-xs tracking-[0.25em] text-slate-500">
                لوحة التحكم اللوجستية
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                نوفا ماكس
              </h1>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs md:flex md:items-center">
            <div className="rounded-full border border-slate-200 bg-white px-4 py-2">
              الإجمالي <span className="ml-2 font-semibold">{stats.total}</span>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-4 py-2">
              قيد الانتظار{" "}
              <span className="ml-2 font-semibold">{stats.pending}</span>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-4 py-2">
              قيد التوصيل{" "}
              <span className="ml-2 font-semibold">{stats.delivering}</span>
            </div>
            <div className="rounded-full border border-slate-200 bg-white px-4 py-2">
              تم التسليم{" "}
              <span className="ml-2 font-semibold">{stats.delivered}</span>
            </div>
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
    <th className="text-left">الرسوم</th>
  </tr>
</thead>

                      <tbody className="divide-y divide-slate-200">
                        {recentOrders.map((order) => (
                          <tr key={order.id}>
                            <td className="py-3 font-semibold text-slate-900">
                              {order.id.slice(0, 8)}...
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
                              {typeof order.delivery_fee === "number"
                                ? order.delivery_fee.toFixed(2)
                                : "-"}
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
                    <h2 className="text-lg font-semibold">إعدادات النظام</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      إدارة بيانات الوصول والرموز الخاصة بالنظام.
                    </p>
                  </div>
                  <Settings className="h-5 w-5 text-slate-500" />
                </div>
                <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">بيانات المتجر</p>
                    <button
                      type="button"
                      onClick={() => resolveStore(false)}
                      className="inline-flex items-center gap-2 text-xs text-slate-500"
                    >
                      <RefreshCw className="h-4 w-4" />
                      ربط المتجر
                    </button>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <input
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400 md:col-span-2"
                      placeholder="أدخل كود الإدارة لربط متجر موجود"
                      value={adminCode}
                      onChange={(e) => setAdminCode(e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => resolveStore(false)}
                      className="h-11 rounded-lg bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      ربط المتجر
                    </button>
                  </div>
                  {savedStores.length > 0 && (
                    <div className="mt-4 grid gap-2 md:grid-cols-2">
                      <p className="text-xs text-slate-500 md:col-span-2">
                        اختر متجرًا محفوظًا بدل إدخال كود الإدارة
                      </p>
                      <select
                        value={storeId}
                        onChange={(e) => {
                          const selected = savedStores.find(
                            (item) => item.id === e.target.value
                          );
                          if (selected) {
                            selectSavedStore(selected);
                            refreshOrders(true);
                            fetchDrivers();
                          }
                        }}
                        className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400 md:col-span-2"
                      >
                        <option value="">اختر متجرًا</option>
                        {savedStores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name ?? "متجر"} • {store.store_code ?? "-"}
                          </option>
                        ))}
                      </select>
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
                      className="h-11 rounded-lg bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      إنشاء متجر
                    </button>
                  </form>
                  <div className="mt-4 grid gap-3 md:grid-cols-3 text-xs">
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                      <p className="text-slate-500">المتجر</p>
                      <p className="mt-1 font-semibold text-slate-900">{storeLabel ?? "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                      <p className="text-slate-500">كود المتجر</p>
                      <p className="mt-1 font-semibold text-slate-900">{storeCode || "-"}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                      <p className="text-slate-500">كود الإدارة</p>
                      <p className="mt-1 font-semibold text-slate-900">{adminCode || "-"}</p>
                    </div>
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
                      إنشاء الحسابات وإدارة حالة المندوبين.
                    </p>
                  </div>
                  <Users className="h-5 w-5 text-slate-500" />
                </div>
                <form onSubmit={createDriver} className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    المتجر المختار:{" "}
                    <span className="font-semibold">
                      {storeLabel ?? "غير محدد"}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">
                      {storeCode ? `(${storeCode})` : ""}
                    </span>
                  </div>
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

                {adminCode && biometricSupported && !financeUnlocked && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <ShieldCheck className="h-4 w-4" />
                      حماية العمليات المالية
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      أكّد هويتك بالبصمة لعرض التفاصيل المالية.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {!biometricLinked && (
                        <button
                          type="button"
                          onClick={async () => {
                            const ok = await registerFinanceBiometric();
                            if (ok) setBiometricLinked(true);
                          }}
                          className="h-10 rounded-lg border border-slate-200 bg-white px-4 text-xs font-semibold text-slate-700"
                        >
                          ?فتح المالية??
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const ok = await ensureFinanceAccess();
                          if (ok) setFinanceUnlocked(true);
                        }}
                        className="h-10 rounded-lg bg-orange-500 px-4 text-xs font-semibold text-white"
                      >
                        فتح المالية
                      </button>
                    </div>
                  </div>
                )}

                {adminCode && (!biometricSupported || financeUnlocked) && (
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
                          <option value="card">بطاقة مصرفية</option>
                          <option value="cash">نقداً</option>
                          <option value="bank_transfer">حوالة مصرفية</option>
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
                              <span>{row.driver_name ?? row.driver_id.slice(0, 6)}</span>
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
                {!adminCode && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    اختر متجرًا من الإعدادات أو أدخل كود الإدارة لتمكين إنشاء الطلبات.
                  </div>
                )}
                <form onSubmit={createOrder} className="mt-5 grid gap-3 md:grid-cols-2">
                  <input
                    name="customer_name"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="اسم العميل"
                    required
                  />
                  <input
                    name="receiver_name"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="اسم المستلم"
                    required
                  />
                  <input
                    name="customer_location_text"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="عنوان العميل"
                    required
                  />
                  <input
                    name="order_type"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="نوع الطلب"
                    required
                  />
                  <input
                    name="price"
                    type="number"
                    step="0.01"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="سعر الطلب"
                  />
                  <input
                    name="delivery_fee"
                    type="number"
                    step="0.01"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="رسوم التوصيل"
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
                    <option value="wallet">محفظة</option>
                    <option value="cash">كاش</option>
                  </select>
                  <div className="relative md:col-span-2">
                    <input
                      name="driver_code"
                      value={driverSearch}
                      onChange={(e) => setDriverSearch(e.target.value)}
                      className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="ابحث عن مندوب (اسم / هاتف / كود) - اختياري"
                    />
                    {driverSearch && (
                      <button
                        type="button"
                        onClick={() => {
                          setDriverSearch("");
                          setDriverMatches([]);
                        }}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400"
                      >
                        مسح
                      </button>
                    )}
                    {driverSearch.trim().length >= 2 && (
                      <div className="absolute z-10 mt-2 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                        {driverSearchLoading && (
                          <div className="px-4 py-3 text-xs text-slate-500">
                            جاري البحث عن المندوبين...
                          </div>
                        )}
                        {!driverSearchLoading && driverMatches.length === 0 && (
                          <div className="px-4 py-3 text-xs text-slate-500">
                            لا يوجد مندوبون متصلون مطابقون للبحث.
                          </div>
                        )}
                        {driverMatches.map((driver) => (
                          <button
                            key={driver.id}
                            type="button"
                            onClick={() => {
                              setDriverSearch(driver.driver_code ?? "");
                              setDriverMatches([]);
                            }}
                            className="flex w-full items-center justify-between px-4 py-3 text-right text-xs text-slate-700 hover:bg-slate-50"
                          >
                            <span className="font-semibold">
                              {driver.name ?? "مندوب"}
                            </span>
                            <span className="text-slate-500">
                              {driver.phone ?? "-"}
                            </span>
                            <span className="text-slate-400">
                              {driver.driver_code ?? "-"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    disabled={!adminCode}
                    className={`h-11 rounded-lg text-sm font-semibold text-white transition md:col-span-2 ${
                      adminCode
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
                {!adminCode && !storeId && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    اختر متجرًا من الإعدادات أو اربط المتجر لعرض الجرد.
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
                        <th className="text-left">الرسوم</th>
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
                          <td className="py-3 font-semibold text-slate-900">
                            {order.id.slice(0, 8)}...
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
                          <td className="text-slate-500">
                            {order.driver_id ? `${order.driver_id.slice(0, 8)}...` : "-"}
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
                            {typeof order.delivery_fee === "number"
                              ? order.delivery_fee.toFixed(2)
                              : "-"}
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
                            {adminCode || storeId
                              ? "لا توجد طلبات حالياً."
                              : "اختر متجرًا من الإعدادات أو اربط المتجر لعرض الطلبات."}
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
                  الجرد
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <input
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="بحث سريع"
                    value={inventoryQuery}
                    onChange={(e) => setInventoryQuery(e.target.value)}
                  />
                  <select
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    value={inventoryStatus}
                    onChange={(e) => setInventoryStatus(e.target.value)}
                  >
                    <option value="all">كل الحالات</option>
                    <option value="pending">قيد الانتظار</option>
                    <option value="accepted">تم القبول</option>
                    <option value="delivering">قيد التوصيل</option>
                    <option value="delivered">تم التسليم</option>
                    <option value="cancelled">ملغي</option>
                  </select>
                  <select
                    className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900"
                    value={inventoryRange}
                    onChange={(e) => setInventoryRange(e.target.value)}
                  >
                    <option value="7">آخر 7 أيام</option>
                    <option value="30">آخر 30 يوم</option>
                    <option value="90">آخر 90 يوم</option>
                    <option value="all">كل الفترات</option>
                  </select>
                </div>
                {!adminCode && !storeId && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    أدخل كود الإدارة أو اربط المتجر لعرض الجرد.
                  </div>
                )}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-right text-sm">
                    <thead className="text-xs text-slate-500">
                      <tr>
                        <th className="py-2">الرقم</th>
                        <th>العميل</th>
                        <th>النوع</th>
                        <th>الحالة</th>
                        <th>التاريخ</th>
                        <th className="text-left">الرسوم</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {inventoryOrders.map((order) => (
                        <tr key={`${order.id}-inv`}>
                          <td className="py-3 font-semibold text-slate-900">
                            {order.id.slice(0, 8)}...
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
                          <td className="text-slate-500">
                            {formatDate(order.created_at)}
                          </td>
                          <td className="text-left text-slate-700">
                            {typeof order.delivery_fee === "number"
                              ? order.delivery_fee.toFixed(2)
                              : "-"}
                          </td>
                        </tr>
                      ))}
                      {inventoryOrders.length == 0 && (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-slate-500">
                            {adminCode || storeId ? "لا توجد بيانات." : "أدخل كود الإدارة أو اربط المتجر لعرض الجرد."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
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
            onClick={clearStore}
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




















