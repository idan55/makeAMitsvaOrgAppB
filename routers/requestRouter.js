import { Router } from "express";
import {
  postRequest,
  getAllRequestsByDistance,
  getAllRequestsByCompleterid,
  getMyOpenRequests,
  wantToHelp,
  markRequestCompleted,
  getMyCompletedRequests,
} from "../controllers/requestController.js";
import { authenticateToken } from "../middleware/authMiddleware.js";
import { requireVerifiedIdentity } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", authenticateToken, requireVerifiedIdentity, postRequest);

router.get("/nearby", getAllRequestsByDistance);

router.get("/my-open", authenticateToken, getMyOpenRequests);

router.get("/my-completed", authenticateToken, getMyCompletedRequests);

router.get("/i-solved", authenticateToken, getAllRequestsByCompleterid);

router.patch("/:id/help", authenticateToken, requireVerifiedIdentity, wantToHelp);

router.patch("/:id/complete", authenticateToken, markRequestCompleted);

export default router;
