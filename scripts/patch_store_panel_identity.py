from pathlib import Path
import re

path = Path("src/app/page.tsx")
text = path.read_text(encoding="utf-8")

def replace_once(old, new, label):
    if old not in text:
        raise SystemExit(f"Missing block: {label}")
    return text.replace(old, new, 1)

# add storeCode state
text = replace_once(
    'const [storeId, setStoreId] = useState("");\n  const [adminCode, setAdminCode] = useState("");\n  const [storeName, setStoreName] = useState("");',
    'const [storeId, setStoreId] = useState("");\n  const [storeCode, setStoreCode] = useState("");\n  const [adminCode, setAdminCode] = useState("");\n  const [storeName, setStoreName] = useState("");',
    "storeCode state"
)

# load storeCode
text = replace_once(
    'setStoreId(localStorage.getItem("nova.store_id") ?? "");\n    setAdminCode(localStorage.getItem("nova.admin_code") ?? "");',
    'setStoreId(localStorage.getItem("nova.store_id") ?? "");\n    setStoreCode(localStorage.getItem("nova.store_code") ?? "");\n    setAdminCode(localStorage.getItem("nova.admin_code") ?? "");',
    "load storeCode"
)

# persist storeCode
text = replace_once(
    'useEffect(() => {\n    localStorage.setItem("nova.store_id", storeId);\n  }, [storeId]);',
    'useEffect(() => {\n    localStorage.setItem("nova.store_id", storeId);\n  }, [storeId]);\n\n  useEffect(() => {\n    localStorage.setItem("nova.store_code", storeCode);\n  }, [storeCode]);',
    "persist storeCode"
)

# clear store
text = replace_once(
    'localStorage.removeItem("nova.store_id");\n    localStorage.removeItem("nova.admin_code");\n    setStoreId("");\n    setAdminCode("");\n    setStoreLabel(null);',
    'localStorage.removeItem("nova.store_id");\n    localStorage.removeItem("nova.store_code");\n    localStorage.removeItem("nova.admin_code");\n    setStoreId("");\n    setStoreCode("");\n    setAdminCode("");\n    setStoreLabel(null);',
    "clear store"
)

# resolveStore
text = replace_once(
    'setStoreId(data.store.id);\n        setStoreLabel(data.store.name ?? null);',
    'setStoreId(data.store.id);\n        setStoreLabel(data.store.name ?? null);\n        setStoreCode(data.store.store_code ?? "");',
    "resolveStore"
)

# createStore
text = replace_once(
    'setStoreId(data.store.id);\n        setAdminCode(data.store.admin_code ?? "");\n        setStoreLabel(data.store.name ?? null);',
    'setStoreId(data.store.id);\n        setStoreCode(data.store.store_code ?? "");\n        setAdminCode(data.store.admin_code ?? "");\n        setStoreLabel(data.store.name ?? null);',
    "createStore"
)

# driver_code from API
text = replace_once(
    'if (data?.driver?.secret_code) {\n        setDriverCode(data.driver.secret_code);',
    'const code = data?.driver?.driver_code ?? data?.driver?.secret_code;\n      if (code) {\n        setDriverCode(code);',
    "driver_code set"
)

# order payload uses driver_code
text = replace_once(
    '      driver_id: formData.get("driver_id"),\n    };',
    '    };\n    const driverCode = String(formData.get("driver_code") ?? "").trim();\n    if (driverCode) payload.driver_code = driverCode;\n',
    "order payload driver_code"
)

# input name/placeholder
text = text.replace('name="driver_id"', 'name="driver_code"')
text = text.replace('placeholder="معرف السائق (اختياري)"', 'placeholder="كود السائق (اختياري)"')
text = text.replace('placeholder="معرف السائق (اختياري)"', 'placeholder="كود السائق (اختياري)"')

# store label line
text = text.replace('المعرف: {storeId || "-"}', 'المعرف الداخلي: {storeId || "-"}')
text = text.replace('المعرف: {storeId || "-"}', 'المعرف الداخلي: {storeId || "-"}')
text = re.sub(
    r'(المعرف الداخلي: \{storeId \|\| "-"\}|المعرف الداخلي: \{storeId \|\| "-"\})\n\s*</p>',
    'المعرف الداخلي: {storeId || "-"}\n                    </p>\n                    <p className="mt-1 text-xs text-slate-500">\n                      كود المتجر: {storeCode || "-"}\n                    </p>',
    text,
    count=1
)

# DriverRow adds driver_code
text = replace_once(
    "  is_active: number | null;\n};",
    "  is_active: number | null;\n  driver_code?: string | null;\n  secret_code?: string | null;\n};",
    "DriverRow"
)

# fetchDrivers map driver_code
text = replace_once(
    "      if (data?.drivers) {\n        setDrivers(data.drivers as DriverRow[]);\n      }",
    "      if (data?.drivers) {\n        const drivers = (data.drivers as DriverRow[]).map((driver) => ({\n          ...driver,\n          driver_code: (driver as any).driver_code ?? (driver as any).secret_code ?? null,\n        }));\n        setDrivers(drivers);\n      }",
    "fetchDrivers map"
)

path.write_text(text, encoding="utf-8")
print("OK")
