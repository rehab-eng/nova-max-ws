from pathlib import Path
import re

path = Path("src/app/page.tsx")
text = path.read_text(encoding="utf-8")

# Icons import
if "ListOrdered" not in text:
    text = text.replace("LayoutDashboard,\n  LogOut,", "LayoutDashboard,\n  ListOrdered,\n  LogOut,")

# SectionKey + nav
text = re.sub(
    r'type SectionKey = .*?;\n',
    'type SectionKey =\n  | "dashboard"\n  | "orders"\n  | "create_order"\n  | "drivers"\n  | "finance"\n  | "inventory"\n  | "settings";\n',
    text,
    flags=re.S
)

text = re.sub(
    r'const sectionNav:.*?];\n',
    'const sectionNav: Array<{ key: SectionKey; label: string; icon: typeof LayoutDashboard }> = [\n'
    '  { key: "dashboard", label: "لوحة التحكم", icon: LayoutDashboard },\n'
    '  { key: "orders", label: "قائمة الطلبات", icon: ClipboardList },\n'
    '  { key: "create_order", label: "إنشاء طلب", icon: PackagePlus },\n'
    '  { key: "drivers", label: "السائقون", icon: Users },\n'
    '  { key: "finance", label: "المالية", icon: Wallet },\n'
    '  { key: "inventory", label: "الجرد", icon: ListOrdered },\n'
    '  { key: "settings", label: "الإعدادات", icon: Settings },\n'
    '];\n',
    text,
    flags=re.S
)

text = re.sub(
    r'const navButtonBase =.*?navButtonInactive =.*?;\n',
    'const navButtonBase =\n'
    '  "w-full rounded-md px-3 py-2 text-sm font-semibold transition flex items-center justify-between text-right";\n'
    'const navButtonActive = "bg-slate-800 text-white";\n'
    'const navButtonInactive = "text-slate-300 hover:bg-slate-800/60";\n',
    text,
    flags=re.S
)

# Format date helper
if "function formatDate" not in text:
    text = text.replace(
        'function formatPayout(value: string | null | undefined): string {\n'
        '  if (!value) return "-";\n'
        '  return payoutLabels[value] ?? value;\n'
        '}\n',
        'function formatPayout(value: string | null | undefined): string {\n'
        '  if (!value) return "-";\n'
        '  return payoutLabels[value] ?? value;\n'
        '}\n\n'
        'function formatDate(value?: string | null): string {\n'
        '  if (!value) return "-";\n'
        '  const date = new Date(value);\n'
        '  if (Number.isNaN(date.getTime())) return "-";\n'
        '  return date.toLocaleDateString("ar", { day: "2-digit", month: "short" });\n'
        '}\n'
    )

# Inventory filters state
text = text.replace(
    '  const [ledgerPeriod, setLedgerPeriod] = useState("daily");\n',
    '  const [ledgerPeriod, setLedgerPeriod] = useState("daily");\n'
    '  const [inventoryQuery, setInventoryQuery] = useState("");\n'
    '  const [inventoryStatus, setInventoryStatus] = useState("all");\n'
    '  const [inventoryRange, setInventoryRange] = useState("30");\n'
)

# Inventory orders memo
text = re.sub(
    r'(const onlineDriversCount = useMemo\\([\\s\\S]*?\\);\\n)',
    r'''\\1
  const inventoryOrders = useMemo(() => {
    const query = inventoryQuery.trim().toLowerCase();
    const range = inventoryRange === "all" ? null : Number(inventoryRange);
    const cutoff = range ? Date.now() - range * 86400000 : null;

    return orders.filter((order) => {
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
  }, [orders, inventoryQuery, inventoryStatus, inventoryRange]);

''',
    text,
    count=1
)

# goToSection: refresh orders for relevant tabs
text = text.replace(
    '    if (section === "finance") {\n      fetchLedger(ledgerPeriod);\n    }\n',
    '    if (section === "finance") {\n      fetchLedger(ledgerPeriod);\n    }\n'
    '    if (section === "orders" || section === "inventory" || section === "create_order") {\n'
    '      refreshOrders();\n'
    '    }\n'
)

# Remove extra descriptions
text = text.replace('                    <p className="mt-1 text-sm text-slate-500">\\n                      ملخص سريع لأهم مؤشرات التشغيل.\\n                    </p>\\n','')
text = text.replace('                    <p className="mt-1 text-sm text-slate-500">\\n                      إدارة بيانات الوصول والرموز الخاصة بالنظام.\\n                    </p>\\n','')
text = text.replace('                    <p className="mt-1 text-sm text-slate-500">\\n                      إدارة حركات المحفظة والتحويلات المالية.\\n                    </p>\\n','')

# Remove finance hint block
text = re.sub(r'\\n\\s*\\{!adminCode && \\(\\s*<div[\\s\\S]*?<\\/div>\\s*\\)\\}\\n', '\\n', text)

# Dashboard table header (first table)
dashboard_head = '''<thead className="text-xs text-slate-500">
  <tr>
    <th className="py-2">الرقم</th>
    <th>العميل</th>
    <th>النوع</th>
    <th>الحالة</th>
    <th className="text-left">الرسوم</th>
  </tr>
</thead>
'''
text = re.sub(r'(?s)<thead className="text-xs text-slate-500">.*?</thead>', dashboard_head, text, count=1)

# Replace inventory block with create/order/inventory separation
new_sections = r'''
            {activeSection === "create_order" && (
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <PackagePlus className="h-5 w-5 text-slate-600" />
                  إنشاء طلب
                </div>
                <form onSubmit={createOrder} className="mt-6 grid gap-3 md:grid-cols-2">
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
                    <option value="card">بطاقة مصرفية</option>
                    <option value="wallet">محفظة محلية</option>
                    <option value="cash">نقداً</option>
                    <option value="bank_transfer">حوالة مصرفية</option>
                  </select>
                  <input
                    name="driver_id"
                    className="h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-900 outline-none focus:border-slate-400"
                    placeholder="معرّف السائق (اختياري)"
                  />
                  <button className="h-11 rounded-lg bg-orange-500 text-sm font-semibold text-white transition hover:bg-orange-600 md:col-span-2">
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
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {orders.map((order) => (
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
                        </tr>
                      ))}
                      {orders.length == 0 && (
                        <tr>
                          <td colSpan={8} className="py-6 text-center text-slate-500">
                            لا توجد طلبات حالياً.
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
                            لا توجد بيانات.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
      </main>
'''
text = re.sub(
    r'\{activeSection === "inventory" && \([\\s\\S]*?\n\s*\)\}\n\s*</main>',
    new_sections,
    text
)

# Sidebar dark navy
text = text.replace(
    '<div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">',
    '<div className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm lg:sticky lg:top-6">'
)
text = text.replace(
    '<p className="text-xs tracking-[0.25em] text-slate-500">الأقسام</p>',
    '<p className="text-xs tracking-[0.25em] text-slate-400">الأقسام</p>'
)
text = text.replace(
    'className={`${navButtonBase} w-full text-right ${',
    'className={`${navButtonBase} ${'
)
text = text.replace(
    'className="mt-6 flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-800"',
    'className="mt-6 flex w-full items-center justify-between rounded-md bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-100 hover:bg-slate-800"'
)

path.write_text(text, encoding="utf-8")
print("OK")
