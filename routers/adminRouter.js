import { Router } from "express";
import { authenticateToken, isAdmin } from "../middleware/authMiddleware.js";
import {
  listUsers,
  banUser,
  unbanUser,
  listPendingIdentityReviews,
  approveIdentity,
  rejectIdentity,
  deleteUserAdmin,
  listRequests,
  deleteRequestAdmin,
} from "../controllers/adminController.js";

const router = Router();

router.use(authenticateToken, isAdmin);

router.get("/users", listUsers);
router.get("/identity/pending", listPendingIdentityReviews);
router.patch("/users/:id/ban", banUser);
router.patch("/users/:id/unban", unbanUser);
router.patch("/users/:id/identity/approve", approveIdentity);
router.patch("/users/:id/identity/reject", rejectIdentity);
router.delete("/users/:id", deleteUserAdmin);

router.get("/requests", listRequests);
router.delete("/requests/:id", deleteRequestAdmin);

export default router;
