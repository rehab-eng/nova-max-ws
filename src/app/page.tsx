"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import {
  ClipboardList,
  Copy,
  LayoutDashboard,
  LogOut,
  PackagePlus,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8787";

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

type ApiResponse = Record<string, any>;

type SectionKey = "dashboard" | "drivers" | "finance" | "inventory" | "settings";

const sectionNav: Array<{ key: SectionKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
  { key: "drivers", label: "إدارة السائقين", icon: Users },
  { key: "finance", label: "العمليات المالية", icon: Wallet },
  { key: "inventory", label: "الجرد", icon: ClipboardList },
  { key: "settings", label: "الإعدادات", icon: Settings },
];

const navButtonBase =
  "rounded-lg border px-3 py-2 text-sm font-semibold transition flex items-center justify-between w-full";
const navButtonActive = "border-slate-900 bg-slate-900 text-white";
const navButtonInactive =
  "border-slate-200 bg-white text-slate-700 hover:border-slate-400";

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
  wallet: "محفظة محلية",
  cash: "نقداً",
  bank_transfer: "حوالة مصرفية",
};

function formatPayout(value: string | null | undefined): string {
  if (!value) return "-";
  return payoutLabels[value] ?? value;
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
  const [adminCode, setAdminCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeLabel, setStoreLabel] = useState<string | null>(null);
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
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricLinked, setBiometricLinked] = useState(false);
  const [financeUnlocked, setFinanceUnlocked] = useState(false);

  const ordersRef = useRef<Order[]>([]);
  const hasLoadedRef = useRef(false);
  const flashTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    setStoreId(localStorage.getItem("nova.store_id") ?? "");
    setAdminCode(localStorage.getItem("nova.admin_code") ?? "");
  }, []);

  useEffect(() => {
    localStorage.setItem("nova.store_id", storeId);
  }, [storeId]);

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

  const clearStore = () => {
    localStorage.removeItem("nova.store_id");
    localStorage.removeItem("nova.admin_code");
    setStoreId("");
    setAdminCode("");
    setStoreLabel(null);
    setFinanceUnlocked(false);
  };

  const getAdminBiometricKey = () => {
    if (!adminCode.trim()) return null;
    return `nova.admin.webauthn.${adminCode.trim()}`;
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

  const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

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
        setAdminCode(data.store.admin_code ?? "");
        setStoreLabel(data.store.name ?? null);
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
      if (data?.driver?.secret_code) {
        setDriverCode(data.driver.secret_code);
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
        setDrivers(data.drivers as DriverRow[]);
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
      driver_id: formData.get("driver_id"),
    };
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
      <div className="mx-auto max-w-[1400px] px-6 py-10">
        <header className="flex flex-col gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white">
              <Image src="/logo.webp" alt="NOVA MAX" width={48} height={48} />
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
                    <h2 className="text-lg font-semibold">???? ??????</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      ???? ???????? ???????? ??????.
                    </p>
                  </div>
                  <LayoutDashboard className="h-5 w-5 text-slate-500" />
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-3">
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">??????</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {storeLabel ?? "??? ?????"}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      ?????: {storeId || "-"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">???????? ???????</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {activeDriversCount}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      ???? ????: {onlineDriversCount}
                    </p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-4">
                    <p className="text-xs text-slate-500">????? ?????</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {stats.total}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      ??? ???????: {stats.delivering}
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-sm font-semibold text-slate-800">??? ???????</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="text-xs text-slate-500">
                        <tr>
                          <th className="py-2">?????</th>
                          <th>??????</th>
                          <th>?????</th>
                          <th>??????</th>
                          <th className="text-left">??????</th>
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
                              ?? ???? ????? ???.
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
                    <h2 className="text-lg font-semibold">????????? ????????</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      ????? ?????? ?????? ???? ??? ???????.
                    </p>
                  </div>
                  <Settings className="h-5 w-5 text-slate-500" />
                </div>
                <div className="mt-5 grid gap-3">
                  <button className="h-11 rounded-lg bg-orange-500 text-sm font-semibold text-white transition hover:bg-orange-600 md:col-span-3">
                    ????? ??????
                  </button>
                </form>

                {driverCode && (
                  <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs text-slate-500">????? ????? ??????</p>
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
                        ???
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-900">????? ????????</p>
                    <button
                      type="button"
                      onClick={fetchDrivers}
                      className="inline-flex items-center gap-2 text-xs text-slate-500"
                    >
                      <RefreshCw className="h-4 w-4" />
                      ?????
                    </button>
                  </div>
                  <div className="mt-3 space-y-2 text-sm">
                    {driversLoading && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-slate-500">
                        ???? ????? ????????...
                      </div>
                    )}
                    {!driversLoading && drivers.length == 0 && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-center text-slate-500">
                        ?? ???? ?????? ???.
                      </div>
                    )}
                    {drivers.map((driver) => {
                      const isActive = driver.is_active != 0;
                      const statusLabel = driver.status == "online" ? "????" : "??? ????";
                      return (
                        <div
                          key={driver.id}
                          className="flex flex-col gap-3 rounded-lg border border-slate-200 px-3 py-3 md:flex-row md:items-center md:justify-between"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">
                              {driver.name ?? "???? ???"}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {driver.phone ?? "-"}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full border border-slate-200 bg-slate-100 px-2 py-1 text-slate-700">
                              {statusLabel}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-slate-700">
                              {isActive ? "?????" : "?????"}
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
                              {isActive ? "?????" : "?????"}
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
                    <h2 className="text-lg font-semibold">???????? ???????</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      ????? ??????? ?????? ?????? ??????.
                    </p>
                  </div>
                  <Wallet className="h-5 w-5 text-slate-500" />
                </div>

                {!adminCode && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    ???? ??? ??????? ????? ?????? ??? ???????? ???????.
                  </div>
                )}

                {adminCode && biometricSupported && !financeUnlocked && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-5">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <ShieldCheck className="h-4 w-4" />
                      ????? ?????? ??????
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      ????? ??? ????? ?????? ??????? ??? ??? ???????? ???????.
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
                          ????? ??????
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
                        ???? ????
                      </button>
                    </div>
                  </div>
                )}

                {adminCode && (!biometricSupported || financeUnlocked) && (
                  <div className="mt-6 grid gap-6 lg:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <p className="text-sm font-semibold text-slate-900">
                        ?????? ???????
                      </p>
                      <div className="mt-4 grid gap-3">
                        <input
                          className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                          placeholder="????? ??????"
                          value={walletDriverId}
                          onChange={(e) => setWalletDriverId(e.target.value)}
                        />
                        <input
                          type="number"
                          step="0.01"
                          className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                          placeholder="??????"
                          value={walletAmount}
                          onChange={(e) => setWalletAmount(e.target.value)}
                        />
                        <select
                          className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                          value={walletMethod}
                          onChange={(e) => setWalletMethod(e.target.value)}
                        >
                          <option value="wallet">????? ?????</option>
                          <option value="card">????? ??????</option>
                          <option value="cash">?????</option>
                          <option value="bank_transfer">????? ??????</option>
                        </select>
                        <input
                          className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                          placeholder="?????? (???????)"
                          value={walletNote}
                          onChange={(e) => setWalletNote(e.target.value)}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <button
                            type="button"
                            onClick={() => updateWallet("credit")}
                            className="h-11 rounded-lg bg-orange-500 text-sm font-semibold text-white hover:bg-orange-600"
                          >
                            ??? ???????
                          </button>
                          <button
                            type="button"
                            onClick={() => updateWallet("debit")}
                            className="h-11 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:border-slate-400"
                          >
                            ??? ??????
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900">
                          ????? ?????? ??????
                        </p>
                        <select
                          className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                          value={ledgerPeriod}
                          onChange={(e) => setLedgerPeriod(e.target.value)}
                        >
                          <option value="daily">????</option>
                          <option value="weekly">??????</option>
                          <option value="monthly">????</option>
                        </select>
                      </div>

                      <div className="mt-4 grid gap-4 text-sm">
                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">????? ???????</p>
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
                            <p className="mt-2 text-xs text-slate-500">?? ???? ??????.</p>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">????? ???????</p>
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
                            <p className="mt-2 text-xs text-slate-500">?? ???? ??????.</p>
                          )}
                        </div>

                        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                          <p className="text-xs text-slate-500">???? ????????</p>
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
                            <p className="mt-2 text-xs text-slate-500">?? ???? ??????.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )}

            {activeSection === "inventory" && (
              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-2 text-lg font-semibold">
                    <PackagePlus className="h-5 w-5 text-slate-600" />
                    ????? ???
                  </div>
                  <form onSubmit={createOrder} className="mt-5 grid gap-3 md:grid-cols-2">
                    <input
                      name="customer_name"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="??? ??????"
                      required
                    />
                    <input
                      name="receiver_name"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="??? ???????"
                      required
                    />
                    <input
                      name="customer_location_text"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="???? ?????"
                      required
                    />
                    <input
                      name="order_type"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="??? ?????"
                      required
                    />
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="??? ?????"
                    />
                    <input
                      name="delivery_fee"
                      type="number"
                      step="0.01"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="???? ???????"
                    />
                    <select
                      name="payout_method"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                      defaultValue=""
                      required
                    >
                      <option value="" disabled>
                        ????? ??? ??????? ??????
                      </option>
                      <option value="card">????? ??????</option>
                      <option value="wallet">????? ?????</option>
                      <option value="cash">?????</option>
                      <option value="bank_transfer">????? ??????</option>
                    </select>
                    <input
                      name="driver_id"
                      className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                      placeholder="????? ?????? (???????)"
                    />
                    <button className="h-11 rounded-lg bg-orange-500 text-sm font-semibold text-white transition hover:bg-orange-600 md:col-span-2">
                      ????? ?????
                    </button>
                  </form>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-lg font-semibold">????? ????????</p>
                    <button
                      type="button"
                      onClick={() => refreshOrders(true)}
                      className="inline-flex items-center gap-2 text-xs text-slate-500"
                    >
                      <RefreshCw className="h-4 w-4" />
                      ?????
                    </button>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full text-right text-sm">
                      <thead className="text-xs text-slate-500">
                        <tr>
                          <th className="py-2">?????</th>
                          <th>??????</th>
                          <th>???????</th>
                          <th>?????</th>
                          <th>??????</th>
                          <th>??????</th>
                          <th>?????</th>
                          <th className="text-left">??????</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {orders.map((order) => (
                          <tr
                            key={order.id}
                            className={`${
                              flashIds.has(order.id)
                                ? "bg-orange-50"
                                : "bg-transparent"
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
                              {order.driver_id
                                ? `${order.driver_id.slice(0, 8)}...`
                                : "-"}
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
                          </tr>
                        ))}
                        {orders.length == 0 && (
                          <tr>
                            <td colSpan={8} className="py-6 text-center text-slate-500">
                              ?? ???? ????? ???.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </div>
            )}
      </main>

      <aside className="order-1 lg:order-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
          <p className="text-xs tracking-[0.25em] text-slate-500">الأقسام</p>
          <div className="mt-4 grid gap-2">
            {sectionNav.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => goToSection(item.key)}
                className={`${navButtonBase} w-full text-right ${
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
            className="mt-6 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800"
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






