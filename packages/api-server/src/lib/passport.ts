import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db, usersTable } from "@golog/db";
import { eq } from "drizzle-orm";
import { PUBLIC_URL } from "./env";

// لا كلمات سر مخزّنة أو صادرة من الإدارة إطلاقاً — الدخول فقط عبر Google أو Telegram.

/**
 * ترقية تلقائية لصلاحية الأدمن عند أول تشغيل: ضع بريدك في متغير البيئة
 * ADMIN_EMAILS (يفصل بينها بفاصلة إن كان أكثر من بريد) وسيُرقّى حسابك
 * تلقائياً عند تسجيل الدخول — بدون الحاجة لتعديل قاعدة البيانات يدوياً.
 * هذا يُطبَّق في كل تسجيل دخول، وليس فقط عند إنشاء الحساب لأول مرة، حتى
 * يعمل حتى لو ضبطت المتغير بعد أن سجّلت حسابك.
 */
function isBootstrapAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.toLowerCase());
}

passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: `${PUBLIC_URL}/api/auth/google/callback`,
    },
    async (_accessToken, _refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value;
        const googleId = profile.id;
        const shouldBeAdmin = isBootstrapAdminEmail(email);

        const existing = await db.select().from(usersTable).where(eq(usersTable.googleId, googleId)).limit(1);

        if (existing.length > 0) {
          let user = existing[0];
          if (shouldBeAdmin && !user.isAdmin) {
            [user] = await db.update(usersTable).set({ isAdmin: true }).where(eq(usersTable.id, user.id)).returning();
          }
          return done(null, { ...user, isNew: false });
        }

        const [user] = await db
          .insert(usersTable)
          .values({
            googleId,
            name: profile.displayName || email?.split("@")[0] || "مستخدم جديد",
            email: email || null,
            photoUrl: profile.photos?.[0]?.value,
            currentRole: "passenger",
            isAdmin: shouldBeAdmin,
          })
          .returning();

        return done(null, { ...user, isNew: true });
      } catch (err) {
        return done(err as Error);
      }
    },
  ),
);

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    done(null, user || null);
  } catch (err) {
    done(err as Error);
  }
});

export default passport;
