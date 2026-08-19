import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  User,
  Trip,
  Booking,
  Parcel,
  City,
  Crossing,
  Message,
  Rating,
  DriverVerification,
  Notification,
} from "./types";

export const qk = {
  me: ["me"] as const,
  trips: (params?: Record<string, string | undefined>) => ["trips", params] as const,
  myTrips: ["trips", "mine"] as const,
  matchesOffers: (params?: Record<string, string | undefined>) => ["matches", "offers", params] as const,
  myBookings: ["bookings", "mine"] as const,
  parcels: (city?: string) => ["parcels", city] as const,
  cities: ["cities"] as const,
  crossings: ["crossings"] as const,
  conversations: ["messages"] as const,
  conversation: (type: string, refId: number) => ["messages", type, refId] as const,
  userRatings: (userId: number) => ["ratings", userId] as const,
  myVerification: ["driver-verification", "mine"] as const,
  myPoints: ["points", "mine"] as const,
  myReferralCode: ["referrals", "my-code"] as const,
  myEarnings: ["earnings", "mine"] as const,
  notifications: ["notifications"] as const,
};

export function useGetMe(options?: { retry?: boolean }) {
  return useQuery<User | null>({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        const data = await api.get<{ user: User | null | undefined }>("/auth/me");
        // تحقق صارم: المستخدم يجب أن يملك id رقمي صحيح
        // حتى لو رجع الباك-إند 200 OK لكن user هو {} أو undefined أو كائن بلا id
        // (مثل مشكلة في serializeUser/deserializeUser) — نعتبره null
        const candidate = data?.user;
        if (candidate && typeof (candidate as any).id === "number") {
          return candidate as User;
        }
        return null;
      } catch {
        return null;
      }
    },
    retry: options?.retry ?? false,
    staleTime: 60000,
  });
}

export function useTelegramLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) => api.post<{ user: User }>("/auth/telegram", payload),
    onSuccess: (res) => qc.setQueryData(qk.me, res.user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post("/auth/logout"),
    onSuccess: () => qc.setQueryData(qk.me, null),
  });
}

export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete("/users/me"),
    onSuccess: () => qc.setQueryData(qk.me, null),
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<User>) => api.patch<{ user: User }>("/users/me", data),
    onSuccess: (res) => qc.setQueryData(qk.me, res.user),
  });
}

export function useSwitchRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: "driver" | "passenger") => api.post<{ user: User }>("/users/me/switch-role", { role }),
    onSuccess: (res) => qc.setQueryData(qk.me, res.user),
  });
}

export function useCities() {
  return useQuery<City[]>({
    queryKey: qk.cities,
    queryFn: async () => (await api.get<{ cities: City[] }>("/cities")).cities,
    staleTime: 300000,
  });
}

export function useCrossings() {
  return useQuery<Crossing[]>({
    queryKey: qk.crossings,
    queryFn: async () => (await api.get<{ crossings: Crossing[] }>("/crossings")).crossings,
    staleTime: 60000,
  });
}

export function useListTrips(params: Record<string, string | undefined> = {}) {
  const entries = Object.entries(params).filter((pair) => pair[1]) as [string, string][];
  const query = new URLSearchParams(entries).toString();
  return useQuery<Trip[]>({
    queryKey: qk.trips(params),
    queryFn: async () => (await api.get<{ trips: Trip[] }>("/trips" + (query ? "?" + query : ""))).trips,
  });
}

export function useMatchedOffers(params: Record<string, string | undefined> = {}) {
  const entries = Object.entries(params).filter((pair) => pair[1]) as [string, string][];
  const query = new URLSearchParams(entries).toString();
  return useQuery<{ trips: Trip[]; filtered: boolean }>({
    queryKey: qk.matchesOffers(params),
    queryFn: () => api.get("/matches/offers-for-me" + (query ? "?" + query : "")),
  });
}

export function useMyTrips() {
  return useQuery<Trip[]>({
    queryKey: qk.myTrips,
    queryFn: async () => (await api.get<{ trips: Trip[] }>("/trips/mine")).trips,
  });
}

export function useCreateTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Trip>) => api.post<{ trip: Trip }>("/trips", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    },
  });
}

export function useCancelTrip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tripId: number) => api.post("/trips/" + tripId + "/cancel"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trips"] }),
  });
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Booking>) => api.post<{ booking: Booking }>("/bookings", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trips"] }),
  });
}

export function useMyBookings() {
  return useQuery<Booking[]>({
    queryKey: qk.myBookings,
    queryFn: async () => (await api.get<{ bookings: Booking[] }>("/bookings/mine")).bookings,
  });
}

function useBookingAction(action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; [key: string]: unknown }) => {
      const { id, ...body } = vars;
      return api.post("/bookings/" + id + "/" + action, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.myBookings });
      qc.invalidateQueries({ queryKey: ["trips"] });
    },
  });
}

export const useAcceptBooking = () => useBookingAction("accept");
export const useRejectBooking = () => useBookingAction("reject");
export const useConfirmBookingOtp = () => useBookingAction("confirm-otp");
export const useNotifyArrival = () => useBookingAction("notify-arrival");
export const useCancelBooking = () => useBookingAction("cancel");

export function useBookingsForMyTrips() {
  return useQuery<Booking[]>({
    queryKey: ["bookings", "for-my-trips"],
    queryFn: async () => (await api.get<{ bookings: Booking[] }>("/bookings/for-my-trips")).bookings,
  });
}

export function useDriverParcels() {
  return useQuery<Parcel[]>({
    queryKey: ["parcels", "mine-as-driver"],
    queryFn: async () => (await api.get<{ parcels: Parcel[] }>("/parcels/mine-as-driver")).parcels,
  });
}

export function useMatchesForTrip(tripId?: number) {
  return useQuery<{ passengerRequests: Trip[]; parcelRequests: Parcel[] }>({
    queryKey: ["matches", "requests-for-trip", tripId],
    queryFn: () => api.get("/matches/requests-for-trip/" + tripId),
    enabled: !!tripId,
  });
}

export function useListParcels(city?: string) {
  return useQuery<Parcel[]>({
    queryKey: qk.parcels(city),
    queryFn: async () => (await api.get<{ parcels: Parcel[] }>("/parcels" + (city ? "?city=" + city : ""))).parcels,
  });
}

export function useCreateParcel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<Parcel>) => api.post<{ parcel: Parcel }>("/parcels", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parcels"] }),
  });
}

function useParcelAction(action: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: number; [key: string]: unknown }) => {
      const { id, ...body } = vars;
      return api.post("/parcels/" + id + "/" + action, body);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["parcels"] }),
  });
}

export const useAcceptParcel = () => useParcelAction("accept");
export const useRejectParcel = () => useParcelAction("reject");
export const useConfirmParcelDelivery = () => useParcelAction("confirm-delivery");

export function useConversations() {
  return useQuery<Message[]>({
    queryKey: qk.conversations,
    queryFn: async () => (await api.get<{ messages: Message[] }>("/messages")).messages,
    refetchInterval: 45000, // مخفَّض من 15 ثانية لتوفير استهلاك البيانات لجمهور بباقات محدودة
  });
}

export function useConversationMessages(conversationType: "booking" | "parcel", refId: number) {
  return useQuery<Message[]>({
    queryKey: qk.conversation(conversationType, refId),
    queryFn: async () =>
      (await api.get<{ messages: Message[] }>("/messages/" + conversationType + "/" + refId)).messages,
    enabled: !!refId,
    refetchInterval: 8000, // محادثة نشطة مفتوحة فعلياً — يبقى نسبياً سريعاً لكن أقل من كل 5 ثوانٍ
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      conversationType: "booking" | "parcel";
      bookingId?: number;
      parcelId?: number;
      content: string;
    }) => api.post<{ message: Message }>("/messages", data),
    onSuccess: (_res, vars) => {
      const refId = (vars.bookingId ?? vars.parcelId) as number;
      qc.invalidateQueries({ queryKey: qk.conversation(vars.conversationType, refId) });
      qc.invalidateQueries({ queryKey: qk.conversations });
    },
  });
}

export function useRequestVoiceUploadUrl() {
  return useMutation({
    mutationFn: (data: { conversationType: "booking" | "parcel"; refId: number }) =>
      api.post<{ uploadUrl: string; objectPath: string }>("/messages/voice-upload-url", data),
  });
}

export function useVoiceUrl(objectPath: string | null) {
  return useQuery<{ url: string }>({
    queryKey: ["messages", "voice-url", objectPath],
    queryFn: () => api.get("/messages/voice-url?path=" + encodeURIComponent(objectPath as string)),
    enabled: !!objectPath,
    staleTime: 10 * 60_000,
  });
}

export function useUserRatings(userId?: number) {
  return useQuery<{ ratings: Rating[]; average: number | null; count: number }>({
    queryKey: qk.userRatings(userId ?? 0),
    queryFn: () => api.get("/ratings/user/" + userId),
    enabled: !!userId,
  });
}

export function useCreateRating() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { bookingId?: number; parcelId?: number; rating: number; comment?: string }) =>
      api.post<{ rating: Rating }>("/ratings", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ratings"] }),
  });
}

export function useCreateReport() {
  return useMutation({
    mutationFn: (data: { bookingId?: number; parcelId?: number; reason: string; details?: string }) =>
      api.post("/reports", data),
  });
}

export function useMyVerification() {
  return useQuery<DriverVerification | null>({
    queryKey: qk.myVerification,
    queryFn: async () =>
      (await api.get<{ verification: DriverVerification | null }>("/driver-verification/mine")).verification,
  });
}

export function useRequestUploadUrl() {
  return useMutation({
    mutationFn: () => api.post<{ uploadUrl: string; objectPath: string }>("/driver-verification/upload-url"),
  });
}

export function useSubmitVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { licenseNumber: string; vehicleInfo?: string; documentObjectPath: string }) =>
      api.post<{ verification: DriverVerification }>("/driver-verification", data),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.myVerification }),
  });
}

export function useMyReferralCode() {
  return useQuery<string>({
    queryKey: qk.myReferralCode,
    queryFn: async () => (await api.get<{ referralCode: string }>("/referrals/my-code")).referralCode,
  });
}

export function useApplyReferral() {
  return useMutation({
    mutationFn: (referralCode: string) => api.post("/referrals/apply", { referralCode }),
  });
}

export function useMyPoints() {
  return useQuery<{ totalPoints: number; transactions: unknown[] }>({
    queryKey: qk.myPoints,
    queryFn: () => api.get("/points/mine"),
  });
}

export function useMyEarnings() {
  return useQuery<{
    passengerEarnings: number;
    parcelEarnings: number;
    total: number;
    completedRidesCount: number;
    deliveredParcelsCount: number;
  }>({
    queryKey: qk.myEarnings,
    queryFn: () => api.get("/earnings/mine"),
  });
}

export function useNotifications() {
  return useQuery<Notification[]>({
    queryKey: qk.notifications,
    queryFn: async () => (await api.get<{ notifications: Notification[] }>("/notifications")).notifications,
    refetchInterval: 45000, // مخفَّض من 20 ثانية — التنبيهات الحرجة تصل فوراً عبر تيليجرام بدل الاعتماد على هذا الاستعلام
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post("/notifications/" + id + "/read"),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications }),
  });
}

export function useTelegramLinkCode() {
  return useQuery<{ code: string; botUsername: string }>({
    queryKey: ["telegram", "link-code"],
    queryFn: () => api.get("/telegram/link-code"),
  });
}
