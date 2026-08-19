import { db, citiesTable, crossingsTable } from "./index";

// بيانات أولية للمدن والمعابر — نفّذ هذا الملف مرة واحدة بعد إنشاء قاعدة
// البيانات: npm run seed (من داخل packages/db)
// يمكن للأدمن لاحقاً إضافة/حذف المزيد من لوحة التحكم مباشرة.

const CITIES: { name: string; country: "SY" | "TR" }[] = [
  { name: "حلب", country: "SY" },
  { name: "إدلب", country: "SY" },
  { name: "عفرين", country: "SY" },
  { name: "أعزاز", country: "SY" },
  { name: "الباب", country: "SY" },
  { name: "جرابلس", country: "SY" },
  { name: "مارع", country: "SY" },
  { name: "سرمدا", country: "SY" },
  { name: "الأتارب", country: "SY" },
  { name: "دمشق", country: "SY" },
  { name: "غازي عنتاب", country: "TR" },
  { name: "هاتاي (أنطاكيا)", country: "TR" },
  { name: "كلس", country: "TR" },
  { name: "أورفة", country: "TR" },
  { name: "مرسين", country: "TR" },
  { name: "إسطنبول", country: "TR" },
];

const CROSSINGS = ["باب الهوى", "باب السلامة", "جرابلس", "الراعي", "أونجوبينار (أويوم أوجاغي)"];

async function seed() {
  console.log("جاري إضافة المدن...");
  for (const city of CITIES) {
    await db.insert(citiesTable).values(city).onConflictDoNothing();
  }

  console.log("جاري إضافة المعابر...");
  for (const name of CROSSINGS) {
    await db.insert(crossingsTable).values({ name }).onConflictDoNothing();
  }

  console.log("تم بنجاح ✅");
  process.exit(0);
}

seed().catch((err) => {
  console.error("فشل التعبئة:", err);
  process.exit(1);
});
