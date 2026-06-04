import jwt from "jsonwebtoken";
import { promisify } from "util";
import User from "../models/userModel.js";

const verifyAsync = promisify(jwt.verify);

export const authenticateSocketToken = async (token) => {
  const decoded = await verifyAsync(
    token,
    process.env.JWT_SECRET || "Idan_HaTotach"
  );
  const user = await User.findById(decoded.id).select("-password");
  if (!user) {
    const error = new Error("Invalid token, user not found");
    error.statusCode = 401;
    throw error;
  }

  return {
    id: user._id.toString(),
    role: user.role,
  };
};

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "Access denied, token missing" });
    }

    req.user = await authenticateSocketToken(token);

    next();
  } catch (err) {
    return res.status(403).json({ error: "Invalid or expired token" });
  }
};

export const isAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access only" });
  }
  next();
};
