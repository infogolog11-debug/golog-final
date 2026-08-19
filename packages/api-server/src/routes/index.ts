import { Router } from "express";
import health from "./health";
import auth from "./auth";
import telegram from "./telegram";
import trips from "./trips";
import bookings from "./bookings";
import parcels from "./parcels";
import messages from "./messages";
import ratings from "./ratings";
import driverVerification from "./driver-verification";
import referrals from "./referrals";
import earnings from "./earnings";
import notifications from "./notifications";
import admin from "./admin";
import reports from "./reports";
import publicRouter from "./public";
import matching from "./matching";

const router = Router();

router.use(health);
router.use(auth);
router.use(telegram);
router.use(trips);
router.use(bookings);
router.use(parcels);
router.use(messages);
router.use(ratings);
router.use(driverVerification);
router.use(referrals);
router.use(earnings);
router.use(notifications);
router.use(publicRouter);
router.use(matching);
router.use(reports);
router.use(admin);

export default router;
