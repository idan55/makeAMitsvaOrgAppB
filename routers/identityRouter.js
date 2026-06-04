import { Router } from "express";
import {
  identityUpload,
  submitManualIdentityVerification,
  getIdentityStatus,
} from "../controllers/identityController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";

const router = Router();

router.post(
  "/manual",
  authenticateToken,
  identityUpload.fields([
    { name: "document", maxCount: 1 },
    { name: "selfie", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  submitManualIdentityVerification
);
router.get("/status", authenticateToken, getIdentityStatus);

export default router;
