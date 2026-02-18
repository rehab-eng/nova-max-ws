"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { Toaster, toast } from "react-hot-toast";
import {
  ArrowPathIcon,
  ClipboardIcon,
  BoltIcon,
  CheckCircleIcon,
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
};

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

function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export default function StorePanel() {
  const [storeId, setStoreId] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [storeName, setStoreName] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [driverCode, setDriverCode] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());

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
    if (!storeId) return;
    let active = true;
    let source: EventSource | null = null;

    const fetchOrders = async (showToasts: boolean) => {
      try {
        const res = await fetch(
          `${API_BASE}/orders?store_id=${encodeURIComponent(storeId)}`
        );
        const data = await res.json();
        if (active && data?.orders) {
          applyOrders(data.orders, showToasts && hasLoadedRef.current);
          if (!hasLoadedRef.current) hasLoadedRef.current = true;
        }
      } catch {
        if (showToasts) toast.error("تعذر تحميل الطلبات");
      }
    };

    const startSSE = () => {
      source = new EventSource(
        `${API_BASE}/orders/stream?store_id=${encodeURIComponent(storeId)}`
      );
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

    startSSE();
    fetchOrders(false);

    const poll = window.setInterval(() => {
      if (!source) fetchOrders(true);
    }, 4000);

    return () => {
      active = false;
      source?.close();
      window.clearInterval(poll);
    };
  }, [storeId]);

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
      const data = await res.json();
      if (data?.store?.id) {
        setStoreId(data.store.id);
        setAdminCode(data.store.admin_code);
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
    if (!storeId || !adminCode) {
      toast.error("معرّف المتجر ورمز الإدارة مطلوبان");
      return;
    }
    if (!driverName.trim() || !driverPhone.trim()) {
      toast.error("اسم السائق ورقم الهاتف مطلوبان");
      return;
    }
    const toastId = toast.loading("جاري إنشاء السائق...");

    const generatedCode = generateCode();

    try {
      const res = await fetch(`${API_BASE}/drivers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Admin-Code": adminCode },
        body: JSON.stringify({
          store_id: storeId,
          admin_code: adminCode,
          name: driverName,
          phone: driverPhone,
          secret_code: generatedCode,
        }),
      });

      const data = await res.json();
      if (data?.driver?.secret_code) {
        setDriverCode(data.driver.secret_code);
        setDriverName("");
        setDriverPhone("");
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

  const createOrder = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!storeId || !adminCode) {
      toast.error("معرّف المتجر ورمز الإدارة مطلوبان");
      return;
    }
    const toastId = toast.loading("جاري إنشاء الطلب...");

    const formData = new FormData(e.currentTarget);
    const payload = {
      store_id: storeId,
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

    try {
      const res = await fetch(`${API_BASE}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <Toaster position="top-right" />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="flex flex-col gap-6 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 p-6 shadow-xl md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white">
              <Image src="/logo.png" alt="NOVA MAX" width={48} height={48} />
            </div>
            <div>
              <p className="text-xs tracking-[0.25em] text-slate-400">
                لوحة التحكم اللوجستية
              </p>
              <h1 className="text-3xl font-semibold tracking-tight">
                نوفا ماكس
              </h1>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs md:flex md:items-center">
            <div className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2">
              الإجمالي <span className="ml-2 font-semibold">{stats.total}</span>
            </div>
            <div className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2">
              قيد الانتظار{" "}
              <span className="ml-2 font-semibold">{stats.pending}</span>
            </div>
            <div className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2">
              قيد التوصيل{" "}
              <span className="ml-2 font-semibold">{stats.delivering}</span>
            </div>
            <div className="rounded-full border border-slate-800 bg-slate-900 px-4 py-2">
              تم التسليم{" "}
              <span className="ml-2 font-semibold">{stats.delivered}</span>
            </div>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">هوية المتجر</h2>
                <p className="mt-1 text-sm text-slate-400">
                  احتفظ ببيانات المتجر جاهزة لكل عملية.
                </p>
              </div>
              <ArrowPathIcon className="h-5 w-5 text-slate-500" />
            </div>
            <div className="mt-5 grid gap-3">
              <input
                className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
                placeholder="معرّف المتجر"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
              />
              <input
                className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
                placeholder="رمز الإدارة"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
              />
            </div>

            <form onSubmit={createStore} className="mt-5 grid gap-3">
              <input
                className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
                placeholder="اسم المتجر"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
              />
              <button className="h-11 rounded-xl bg-indigo-500 text-sm font-semibold text-white transition hover:bg-indigo-400">
                إنشاء المتجر
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg">
            <div className="flex items-center gap-2 text-lg font-semibold">
              <CheckCircleIcon className="h-5 w-5 text-orange-400" />
              مدخل السائق
            </div>
            <p className="mt-1 text-sm text-slate-400">
              توليد كود سري آمن للسائق تلقائياً.
            </p>
            <form onSubmit={createDriver} className="mt-5 grid gap-3">
              <input
                className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
                placeholder="اسم السائق"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
              />
              <input
                className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
                placeholder="هاتف السائق"
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
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

        <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg">
          <div className="flex items-center gap-2 text-lg font-semibold">
            <BoltIcon className="h-5 w-5 text-indigo-400" />
            إنشاء طلب
          </div>
          <form onSubmit={createOrder} className="mt-5 grid gap-3 md:grid-cols-2">
            <input
              name="customer_name"
              className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
              placeholder="اسم العميل"
              required
            />
            <input
              name="receiver_name"
              className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
              placeholder="اسم المستلم"
              required
            />
            <input
              name="customer_location_text"
              className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
              placeholder="موقع الطلب"
              required
            />
            <input
              name="order_type"
              className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
              placeholder="نوع الطلب"
              required
            />
            <input
              name="price"
              type="number"
              step="0.01"
              className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
              placeholder="سعر الطلب"
            />
            <input
              name="delivery_fee"
              type="number"
              step="0.01"
              className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
              placeholder="رسوم التوصيل"
            />
            <select
              name="payout_method"
              className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
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
              className="h-11 rounded-xl border border-slate-800 bg-slate-950 px-4 text-sm text-slate-100 outline-none focus:border-slate-600"
              placeholder="معرّف السائق (اختياري)"
            />
            <button className="h-11 rounded-xl bg-indigo-500 text-sm font-semibold text-white transition hover:bg-indigo-400 md:col-span-2">
              إنشاء الطلب
            </button>
          </form>
        </section>

        <section className="mt-6 rounded-3xl border border-slate-800 bg-slate-900/70 p-6 shadow-lg">
          <div className="flex items-center gap-2 text-lg font-semibold">
            الطلبات المباشرة
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="text-xs uppercase tracking-[0.2em] text-slate-400">
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
                    <td className="py-3 font-semibold text-slate-100">
                      {order.id.slice(0, 8)}...
                    </td>
                    <td className="text-slate-200">{order.customer_name ?? "-"}</td>
                    <td className="text-slate-300">{order.receiver_name ?? "-"}</td>
                    <td className="text-slate-300">{order.order_type ?? "-"}</td>
                    <td className="text-slate-400">
                      {order.driver_id ? `${order.driver_id.slice(0, 8)}...` : "-"}
                    </td>
                    <td>
                      <span
                        className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium ${
                          statusStyles[order.status ?? ""] ??
                          "border-slate-700 bg-slate-800 text-slate-300"
                        }`}
                      >
                        {formatStatus(order.status)}
                      </span>
                    </td>
                    <td className="text-slate-300">
                      {formatPayout(order.payout_method)}
                    </td>
                    <td className="text-left text-slate-200">
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
