import jwt from "jsonwebtoken";
import { promisify } from "util";
import User from "../models/userModel.js";

const verifyAsync = promisify(jwt.verify);

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access denied, token missing" });
    }

    const decoded = await verifyAsync(token, process.env.JWT_SECRET || "Idan_HaTotach");
    const user = await User.findById(decoded.id).select("-password");
    if (!user) {
      return res.status(401).json({ error: "Invalid token, user not found" });
    }

    req.user = {
      id: user._id.toString(),
      role: user.role,
      identityStatus: user.identityStatus || "not_started",
    };

    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

export const requireVerifiedIdentity = (req, res, next) => {
  if (req.user?.identityStatus !== "verified") {
    return res.status(403).json({
      error: "Identity verification required",
      identityStatus: req.user?.identityStatus || "not_started",
    });
  }
  next();
};

export const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
};
