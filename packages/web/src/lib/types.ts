export type Gender = "male" | "female";
export type Role = "driver" | "passenger";

export interface User {
  id: number;
  googleId: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
  telegramChatId: string | null;
  name: string;
  email: string | null;
  photoUrl: string | null;
  gender: Gender | null;
  phone: string | null;
  currentRole: Role;
  carType: string | null;
  carModel: string | null;
  carColor: string | null;
  carPlate: string | null;
  isAdmin: boolean;
  isVerified: boolean;
  isBanned: boolean;
  trustedForSensitiveTrips: boolean;
  adminPermissions: string[];
  ageConfirmedAt: string | null;
  loyaltyPoints: number;
  referralCode: string | null;
  createdAt: string;
}

export type TripKind = "offer" | "request";
export type TripStatus = "active" | "full" | "cancelled" | "completed";
export type Currency = "USD" | "TRY" | "SYP";

export interface Trip {
  id: number;
  kind: TripKind;
  driverId: number | null;
  requesterId: number | null;
  origin: string;
  destination: string;
  crossingId: number | null;
  departureTime: string;
  totalSeats: number;
  availableSeats: number;
  carType: string | null;
  carModel: string | null;
  carColor: string | null;
  carPlate: string | null;
  pricePerSeat: string | null;
  currency: Currency;
  womenFamilyOnly: boolean;
  acceptsParcels: boolean;
  maxParcelWeightKg: string | null;
  status: TripStatus;
  createdAt: string;
  /** مُرفَقة فقط في استجابات البحث والمطابقة */
  driverName?: string | null;
  driverPhone?: string | null;
  driverPhotoUrl?: string | null;
  driverIsVerified?: boolean | null;
  driverCompletedRides?: number;
}

export type BookingStatus = "pending" | "confirmed" | "completed" | "cancelled" | "rejected";

export interface Booking {
  id: number;
  tripId: number;
  passengerId: number;
  seatsBooked: number;
  status: BookingStatus;
  otpCode: string | null;
  otpConfirmedAt: string | null;
  /** عدد الأطفال القاصرين المرافقين لهذا الحجز — معلوماتي فقط، القاصر لا يسافر إلا برفقة وليّه ضمن نفس الحجز */
  accompaniedMinorsCount: number;
  cancelReason: string | null;
  createdAt: string;
  /** مُرفَق فقط في استجابة /bookings/mine */
  trip?: Trip & { driverName?: string | null; driverPhone?: string | null; driverIsVerified?: boolean | null };
  /** مُرفَق فقط في استجابة /bookings/for-my-trips */
  passengerName?: string | null;
  passengerPhone?: string | null;
}

export type ParcelStatus = "pending" | "accepted" | "delivered" | "cancelled" | "rejected";

export interface Parcel {
  id: number;
  senderId: number;
  tripId: number | null;
  origin: string;
  destination: string;
  description: string;
  weightKg: string;
  photoUrl: string | null;
  receiverName: string;
  receiverPhone: string;
  price: string | null;
  currency: Currency;
  otpCode: string | null;
  otpConfirmedAt: string | null;
  status: ParcelStatus;
  createdAt: string;
}

export interface City {
  id: number;
  name: string;
  country: string | null;
}

export interface Crossing {
  id: number;
  name: string;
  status: "open" | "closed";
  statusNote: string | null;
}

export interface Message {
  id: number;
  conversationType: "booking" | "parcel";
  bookingId: number | null;
  parcelId: number | null;
  senderId: number;
  receiverId: number;
  content: string;
  readAt: string | null;
  createdAt: string;
}

export interface Rating {
  id: number;
  fromUserId: number;
  toUserId: number;
  bookingId: number | null;
  parcelId: number | null;
  rating: number;
  comment: string | null;
  createdAt: string;
}

export interface DriverVerification {
  id: number;
  userId: number;
  licenseNumber: string;
  vehicleInfo: string | null;
  documentObjectPath: string;
  status: "pending" | "approved" | "rejected";
  reviewerNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
}

export interface Notification {
  id: number;
  userId: number;
  type: string;
  title: string;
  body: string | null;
  relatedId: number | null;
  isRead: boolean;
  createdAt: string;
}

export interface Report {
  id: number;
  reporterId: number;
  reportedUserId: number;
  bookingId: number | null;
  parcelId: number | null;
  reason: string;
  details: string | null;
  status: "pending" | "reviewed" | "dismissed";
  reviewerNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export const ADMIN_PERMISSION_LABELS: Record<string, string> = {
  users: "إدارة المستخدمين (حظر/رفع حظر)",
  verifications: "مراجعة توثيق السائقين",
  reports: "مراجعة البلاغات",
  trips_bookings: "إدارة الرحلات والحجوزات والشحنات",
  pricing: "عرض تقرير الأسعار",
  catalog: "إدارة المدن والمعابر",
};
