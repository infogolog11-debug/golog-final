import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { db, usersTable } from "@golog/db";
import { eq } from "drizzle-orm";
import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL,
  ADMIN_EMAILS,
} from "./env";

function isBootstrapAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  console.info(
    "[passport] ✅ Google OAuth مفعّل.\n" +
    "  → GOOGLE_CLIENT_ID    = " + GOOGLE_CLIENT_ID.slice(0, 8) + "...\n" +
    "  → GOOGLE_CALLBACK_URL = " + GOOGLE_CALLBACK_URL + "\n" +
    "  تأكد من أن نفس الرابط أعلاه مُضاف بدقّة في Google Cloud Console\n" +
    "  (APIs & Services → Credentials → OAuth 2.0 Client IDs → Authorized redirect URIs)"
  );
  passport.use(
    new GoogleStrategy(
      {
        clientID: GOOGLE_CLIENT_ID,
        clientSecret: GOOGLE_CLIENT_SECRET,
        callbackURL: GOOGLE_CALLBACK_URL,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          const googleId = profile.id;
          const shouldBeAdmin = isBootstrapAdminEmail(email);

          const existing = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.googleId, googleId))
            .limit(1);

          if (existing.length > 0) {
            let user = existing[0];
            if (shouldBeAdmin && !user.isAdmin) {
              [user] = await db
                .update(usersTable)
                .set({ isAdmin: true })
                .where(eq(usersTable.id, user.id))
                .returning();
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
} else {
  console.warn(
    "[passport] ⚠️  GOOGLE_CLIENT_ID أو GOOGLE_CLIENT_SECRET غير مُعرَّفين — تسجيل الدخول عبر Google لن يعمل حتى يتم إضافتها في إعدادات Vercel."
  );
}

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: number, done) => {
  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, id))
      .limit(1);
    if (!user) return done(null, null);
    if (user.isBanned) {
      console.warn(
        "[passport] ⛔ محاولة دخول لحساب محظور (id=" + user.id + ", name=" + user.name + ")"
      );
      return done(new Error("ACCOUNT_BANNED"), null);
    }
    done(null, user);
  } catch (err) {
    done(err as Error);
  }
});

export default passport;
