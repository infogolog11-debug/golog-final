import type { Request, Response, NextFunction } from "express";
import { db, usersTable, type AdminPermission } from "@golog/db";
import { eq } from "drizzle-orm";

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.()) return res.status(401).json({ error: "غير مسجّل الدخول" });
  const uid = (req.user as any)?.id;
  if (typeof uid !== "number" || isNaN(uid)) {
    req.session?.destroy?.(() => {});
    return res.status(401).json({ error: "جلسة غير صالحة، يرجى تسجيل الدخول مجدداً" });
  }
  if ((req.user as any)?.isBanned) {
    req.logout?.(() => {
      req.session?.destroy?.(() => {});
    });
    return res.status(403).json({ error: "هذا الحساب محظور، يرجى التواصل مع الإدارة" });
  }
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.()) return res.status(401).json({ error: "غير مسجّل الدخول" });
  const userId = (req.user as any).id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.isAdmin) return res.status(403).json({ error: "صلاحيات إدارة مطلوبة" });
  next();
}

/**
 * يسمح بالدخول لأدمن كامل (isAdmin) أو لأدمن مساعد يملك أي صلاحية محدودة
 * واحدة على الأقل — يُستخدم فقط لبوابة الدخول العامة للوحة الإدارة، ثم
 * تُفرَض الصلاحية الدقيقة لكل مجموعة مسارات عبر requirePermission أدناه.
 */
export async function requireAnyAdminAccess(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated?.()) return res.status(401).json({ error: "غير مسجّل الدخول" });
  const userId = (req.user as any).id;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.isAdmin && !(user?.adminPermissions?.length > 0)) {
    return res.status(403).json({ error: "صلاحيات إدارة مطلوبة" });
  }
  (req as any).adminUser = user;
  next();
}

/**
 * يتحقق من صلاحية محددة — أدمن كامل (isAdmin) يتجاوزها دائماً، وأدمن
 * مساعد يحتاج أن تكون هذه الصلاحية بالذات ضمن adminPermissions الخاصة به.
 */
export function requirePermission(permission: AdminPermission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated?.()) return res.status(401).json({ error: "غير مسجّل الدخول" });
    const userId = (req.user as any).id;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user?.isAdmin && !user?.adminPermissions?.includes(permission)) {
      return res.status(403).json({ error: "لا تملك صلاحية هذا القسم" });
    }
    next();
  };
}
