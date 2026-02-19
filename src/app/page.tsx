"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import {
  ArrowPathIcon,
  ClipboardIcon,
  BoltIcon,
  CheckCircleIcon,
  Bars3Icon,
  XMarkIcon,
  Cog6ToothIcon,
  LifebuoyIcon,
  ArrowRightOnRectangleIcon,
} from "@heroicons/react/24/outline";

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

type ApiResponse = Record<string, any>;

const statusStyles: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  accepted: "bg-sky-100 text-sky-800 border-sky-200",
  delivering: "bg-indigo-100 text-indigo-800 border-indigo-200",
  delivered: "bg-orange-100 text-orange-800 border-orange-200",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
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
  const [driverEmail, setDriverEmail] = useState("");
  const [driverPhotoUrl, setDriverPhotoUrl] = useState("");
  const [driverCode, setDriverCode] = useState<string | null>(null);
  const [walletDriverId, setWalletDriverId] = useState("");
  const [walletAmount, setWalletAmount] = useState("");
  const [walletMethod, setWalletMethod] = useState("wallet");
  const [walletNote, setWalletNote] = useState("");
  const [deleteDriverId, setDeleteDriverId] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);

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

  const clearStore = () => {
    localStorage.removeItem("nova.store_id");
    localStorage.removeItem("nova.admin_code");
    setStoreId("");
    setAdminCode("");
    setStoreLabel(null);
  };

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    setMenuOpen(false);
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
                  <BoltIcon className="h-4 w-4 text-indigo-500" />
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
        toast(`تم تحديث حالة السائق`);
        return;
      }
      if (type === "driver_created") {
        toast.success("تم إنشاء سائق جديد");
        return;
      }
      if (type === "driver_disabled") {
        toast("تم تعطيل سائق");
        return;
      }
      if (type === "wallet_transaction") {
        toast("تم تحديث محفظة السائق");
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
    if (!driverName.trim() || !driverPhone.trim() || !driverEmail.trim()) {
      toast.error("اسم السائق ورقم الهاتف مطلوبان");
      return;
    }
    const toastId = toast.loading("جاري إنشاء السائق...");

    try {
      const payload: Record<string, unknown> = {
        admin_code: adminCode,
        name: driverName,
        phone: driverPhone,
        email: driverEmail,
      };
      if (driverPhotoUrl) payload.photo_url = driverPhotoUrl;
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
        setDriverEmail("");
        setDriverPhotoUrl("");
        toast.success("تم إنشاء السائق", { id: toastId });
        toast("تم تجهيز صندوق نسخ الكود", { icon: "✨" });
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
      } else {
        toast.error(data?.error ?? "فشل تحديث المحفظة", { id: toastId });
      }
    } catch {
      toast.error("خطأ في الشبكة", { id: toastId });
    }
  };

  const removeDriver = async () => {
    if (!adminCode) {
      toast.error("رمز الإدارة مطلوب");
      return;
    }
    if (!deleteDriverId.trim()) {
      toast.error("معرّف السائق مطلوب");
      return;
    }
    const confirmed = window.confirm(
      "سيتم حذف السائق نهائياً وإلغاء ربطه بالطلبات السابقة. هل تريد المتابعة؟"
    );
    if (!confirmed) return;

    const toastId = toast.loading("جاري حذف السائق...");
    try {
      const res = await fetch(
        `${API_BASE}/drivers/${encodeURIComponent(deleteDriverId)}`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json", "X-Admin-Code": adminCode },
          body: JSON.stringify({ admin_code: adminCode }),
        }
      );
      const data = (await res.json()) as ApiResponse;
      if (data?.ok) {
        toast.success("تم حذف السائق", { id: toastId });
        setDeleteDriverId("");
      } else {
        toast.error(data?.error ?? "فشل حذف السائق", { id: toastId });
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

  return (
    <div className="min-h-screen bg-[#f5f7ff] text-slate-900 [background-image:radial-gradient(circle_at_top,rgba(255,255,255,0.9),transparent_55%),radial-gradient(circle_at_bottom,rgba(186,230,253,0.65),transparent_55%)]">
      <Toaster position="top-right" />
      {menuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            className="absolute inset-0 bg-black/20"
            onClick={() => setMenuOpen(false)}
            aria-label="إغلاق القائمة"
          />
          <div className="relative h-full w-[85%] max-w-xs bg-white/80 p-5 text-right shadow-2xl backdrop-blur-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs tracking-[0.25em] text-slate-500">نوفا ماكس</p>
                <p className="text-base font-semibold text-slate-900">
                  {storeLabel ?? "لوحة المتجر"}
                </p>
              </div>
              <button
                type="button"
                className="rounded-full border border-white/60 bg-white/70 p-2"
                onClick={() => setMenuOpen(false)}
                aria-label="إغلاق"
              >
                <XMarkIcon className="h-5 w-5 text-slate-700" />
              </button>
            </div>

            <div className="mt-6 space-y-3">
              <button
                type="button"
                onClick={() => scrollToSection("store")}
                className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-800"
              >
                هوية المتجر
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("drivers")}
                className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-800"
              >
                السائقون
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("wallet")}
                className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-800"
              >
                المحفظة
              </button>
              <button
                type="button"
                onClick={() => scrollToSection("orders")}
                className="w-full rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-800"
              >
                الطلبات
              </button>
            </div>

            <div className="mt-6 rounded-2xl border border-white/60 bg-white/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <Cog6ToothIcon className="h-4 w-4 text-orange-500" />
                الإعدادات
              </div>
              <div className="mt-3 space-y-2 text-xs text-slate-600">
                <div className="flex items-center justify-between">
                  <span>تنبيهات الطلبات</span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700">
                    مفعّل
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>الوضع الصامت</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-700">
                    غير مفعّل
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm font-semibold text-slate-800"
              >
                الدعم الفني
                <LifebuoyIcon className="h-4 w-4 text-slate-600" />
              </button>
              <button
                type="button"
                onClick={clearStore}
                className="flex w-full items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
              >
                تسجيل الخروج
                <ArrowRightOnRectangleIcon className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_26px_70px_-45px_rgba(0,0,0,0.9)] backdrop-blur-xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/60 bg-white/70 text-slate-700"
              aria-label="فتح القائمة"
            >
              <Bars3Icon className="h-5 w-5" />
            </button>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white">
              <Image src="/logo.png" alt="NOVA MAX" width={48} height={48} />
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
            <div className="rounded-full border border-white/15 bg-white/70 px-4 py-2 backdrop-blur">
              الإجمالي <span className="ml-2 font-semibold">{stats.total}</span>
            </div>
            <div className="rounded-full border border-white/15 bg-white/70 px-4 py-2 backdrop-blur">
              قيد الانتظار{" "}
              <span className="ml-2 font-semibold">{stats.pending}</span>
            </div>
            <div className="rounded-full border border-white/15 bg-white/70 px-4 py-2 backdrop-blur">
              قيد التوصيل{" "}
              <span className="ml-2 font-semibold">{stats.delivering}</span>
            </div>
            <div className="rounded-full border border-white/15 bg-white/70 px-4 py-2 backdrop-blur">
              تم التسليم{" "}
              <span className="ml-2 font-semibold">{stats.delivered}</span>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section
            id="store"
            className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">هوية المتجر</h2>
                <p className="mt-1 text-sm text-slate-500">
                  احتفظ ببيانات المتجر جاهزة لكل عملية.
                </p>
              </div>
              <ArrowPathIcon className="h-5 w-5 text-slate-500" />
            </div>
            <div className="mt-5 grid gap-3">
              <input
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="رمز الإدارة"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
              />
              <button
                type="button"
                onClick={() => resolveStore(false)}
                className="h-11 rounded-xl border border-white/60 bg-white/70 text-sm font-semibold text-slate-700 transition hover:border-slate-500"
              >
                ربط المتجر بالكود
              </button>
            </div>

            {storeId && (
              <div className="mt-4 rounded-2xl border border-white/60 bg-white/70 px-4 py-3 text-sm text-slate-700">
                <p className="text-xs text-slate-500">المتجر الحالي</p>
                <p className="mt-1 font-semibold text-slate-900">
                  {storeLabel ?? "تم ربط المتجر"}
                </p>
              </div>
            )}

            <form onSubmit={createStore} className="mt-5 grid gap-3">
              <input
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="اسم المتجر"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
              />
              <button className="h-11 rounded-xl bg-indigo-500 text-sm font-semibold text-white transition hover:bg-indigo-400">
                إنشاء المتجر
              </button>
            </form>
          </section>

          <section
            id="drivers"
            className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl"
          >
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircleIcon className="h-5 w-5 text-orange-400" />
              مدخل السائق
            </div>
            <p className="mt-1 text-sm text-slate-500">
              توليد كود سري آمن للسائق تلقائياً.
            </p>
            <form onSubmit={createDriver} className="mt-5 grid gap-3">
              <input
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="اسم السائق"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
              <input
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="هاتف السائق"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
              />
              <input
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="البريد الإلكتروني"
                value={driverEmail}
                onChange={(e) => setDriverEmail(e.target.value)}
              />
              <input
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="رابط صورة السائق (اختياري)"
                value={driverPhotoUrl}
                onChange={(e) => setDriverPhotoUrl(e.target.value)}
              />
              <button className="h-11 rounded-xl bg-orange-500 text-sm font-semibold text-white transition hover:bg-orange-400">
                توليد وإنشاء السائق
              </button>
            </form>

            {driverCode && (
              <div className="mt-5 rounded-2xl border border-orange-500/30 bg-orange-500/10 p-4">
                <p className="text-xs tracking-[0.2em] text-orange-200">
                  الكود السري للسائق
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-2xl font-semibold text-orange-100">
                    {driverCode}
                  </span>
                  <button
                    onClick={copyCode}
                    className="inline-flex items-center gap-2 rounded-xl border border-orange-400/40 px-3 py-2 text-xs text-orange-100 transition hover:bg-orange-500/20"
                    type="button"
                  >
                    <ClipboardIcon className="h-4 w-4" />
                    نسخ
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section
            id="wallet"
            className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl"
          >
            <div className="flex items-center gap-2 text-lg font-semibold">
              إدارة محفظة السائق
            </div>
            <p className="mt-1 text-sm text-slate-500">
              شحن أو سحب مستحقات السائق حسب طريقة الدفع.
            </p>
            <div className="mt-4 grid gap-3">
              <input
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="معرّف السائق"
                value={walletDriverId}
                onChange={(e) => setWalletDriverId(e.target.value)}
              />
              <input
                type="number"
                step="0.01"
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="المبلغ"
                value={walletAmount}
                onChange={(e) => setWalletAmount(e.target.value)}
              />
              <select
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                value={walletMethod}
                onChange={(e) => setWalletMethod(e.target.value)}
              >
                <option value="wallet">محفظة محلية</option>
                <option value="card">بطاقة مصرفية</option>
                <option value="cash">نقداً</option>
                <option value="bank_transfer">حوالة مصرفية</option>
              </select>
              <input
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="ملاحظة (اختياري)"
                value={walletNote}
                onChange={(e) => setWalletNote(e.target.value)}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => updateWallet("credit")}
                  className="h-11 rounded-xl bg-orange-500 text-sm font-semibold text-white transition hover:bg-orange-400"
                >
                  شحن المحفظة
                </button>
                <button
                  type="button"
                  onClick={() => updateWallet("debit")}
                  className="h-11 rounded-xl border border-rose-400/40 bg-rose-500/10 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
                >
                  سحب المبلغ
                </button>
              </div>
            </div>
          </section>

          <section
            id="driver-remove"
            className="rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl"
          >
            <div className="flex items-center gap-2 text-lg font-semibold">
              حذف السائق نهائياً
            </div>
            <p className="mt-1 text-sm text-slate-500">
              استخدم هذه الخاصية عند مغادرة السائق للعمل.
            </p>
            <div className="mt-4 grid gap-3">
              <input
                className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                placeholder="معرّف السائق"
                value={deleteDriverId}
                onChange={(e) => setDeleteDriverId(e.target.value)}
              />
              <button
                type="button"
                onClick={removeDriver}
                className="h-11 rounded-xl border border-rose-400/40 bg-rose-500/10 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
              >
                حذف السائق نهائياً
              </button>
            </div>
          </section>
        </div>

        <section
          id="order-create"
          className="mt-6 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BoltIcon className="h-5 w-5 text-indigo-400" />
            إنشاء طلب
          </div>
          <form onSubmit={createOrder} className="mt-5 grid gap-3 md:grid-cols-2">
            <input
              name="customer_name"
              className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
              placeholder="اسم العميل"
              required
            />
            <input
              name="receiver_name"
              className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
              placeholder="اسم المستلم"
              required
            />
            <input
              name="customer_location_text"
              className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
              placeholder="موقع الطلب"
              required
            />
            <input
              name="order_type"
              className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
              placeholder="نوع الطلب"
              required
            />
            <input
              name="price"
              type="number"
              step="0.01"
              className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
              placeholder="سعر الطلب"
            />
            <input
              name="delivery_fee"
              type="number"
              step="0.01"
              className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
              placeholder="رسوم التوصيل"
            />
            <select
              name="payout_method"
              className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
              defaultValue=""
              required
            >
              <option value="" disabled>
                طريقة دفع مستحقات السائق
              </option>
              <option value="card">بطاقة مصرفية</option>
              <option value="wallet">محفظة محلية</option>
              <option value="cash">نقداً</option>
              <option value="bank_transfer">حوالة مصرفية</option>
            </select>
            <input
              name="driver_id"
              className="h-11 rounded-xl border border-white/60 bg-white/70 px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
              placeholder="معرّف السائق (اختياري)"
            />
            <button className="h-11 rounded-xl bg-indigo-500 text-sm font-semibold text-white transition hover:bg-indigo-400 md:col-span-2">
              إنشاء الطلب
            </button>
          </form>
        </section>

        <section
          id="orders"
          className="mt-6 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.85)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-2 text-lg font-semibold">
            الطلبات المباشرة
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="py-2">الطلب</th>
                  <th>العميل</th>
                  <th>المستلم</th>
                  <th>النوع</th>
                  <th>السائق</th>
                  <th>الحالة</th>
                  <th>الدفع</th>
                  <th className="text-left">الرسوم</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className={`transition ${
                      flashIds.has(order.id)
                        ? "bg-amber-500/10"
                        : "bg-transparent"
                    }`}
                  >
                    <td className="py-3 font-semibold text-slate-900">
                      {order.id.slice(0, 8)}...
                    </td>
                    <td className="text-slate-700">{order.customer_name ?? "-"}</td>
                    <td className="text-slate-700">{order.receiver_name ?? "-"}</td>
                    <td className="text-slate-700">{order.order_type ?? "-"}</td>
                    <td className="text-slate-500">
                      {order.driver_id ? `${order.driver_id.slice(0, 8)}...` : "-"}
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                          statusStyles[order.status ?? ""] ??
                          "border-white/60 bg-slate-800 text-slate-700"
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
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-500">
                      لا توجد طلبات بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

