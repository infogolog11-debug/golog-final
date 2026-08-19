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
    done(null, user || null);
  } catch (err) {
    done(err as Error);
  }
});

export default passport;
