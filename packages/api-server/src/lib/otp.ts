import crypto from "crypto";

/** يولّد رمز OTP من 4 أرقام (0000–9999) عند تأكيد الحجز من قبل السائق */
export function generateOtp(): string {
  return crypto.randomInt(0, 10000).toString().padStart(4, "0");
}
