import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User, { normalizePhone } from "../models/userModel.js";

function sanitizeUser(user) {
  if (!user) return null;
  const normalizedPhone = normalizePhone(user.phone);
  const legacyFixedPhone =
    normalizedPhone ||
    (user.phone
      ? user.phone.replace(/^\+0+/, "+972").replace(/^0+/, "+972")
      : null);
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: normalizedPhone || legacyFixedPhone || user.phone,
    age: user.age,
    role: user.role,
    isBanned: user.isBanned ?? false,
    stars: user.stars ?? 0,
    couponEarned: user.couponEarned ?? false,
    profileImage: user.profileImage || "",
    identityStatus: user.identityStatus || "not_started",
    identityProvider: user.identityProvider || null,
    identitySubmittedAt: user.identitySubmittedAt || null,
    identityVerifiedAt: user.identityVerifiedAt || null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function registerUser(req, res) {
  try {
    const { name, age, email, password, phone, profileImage } = req.body;

    if (!name || !age || !email || !password || !phone) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (await User.findOne({ email: normalizedEmail })) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      name,
      age,
      email: normalizedEmail,
      password: hashedPassword,
      phone,
      profileImage: profileImage || "",
    });

    const token = jwt.sign(
      { id: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res
      .status(201)
      .json({ message: "User registered", token, user: sanitizeUser(newUser) });
  } catch (err) {
    console.error("registerUser error:", err);
    if (err.code === 11000) {
      return res.status(400).json({
        error: "Duplicate field value",
        details: "User already exists with this email or phone",
      });
    }
    if (err.name === "ValidationError") {
      return res
        .status(400)
        .json({ error: "Invalid input", details: err.message });
    }
    res
      .status(500)
      .json({ error: "Error registering user", details: err.message });
  }
}

export async function loginUser(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email & password required" });

    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (!user)
      return res.status(401).json({ error: "Invalid email or password" });

    if (user.isBanned) {
      return res.status(403).json({ error: "Account is banned" });
    }

    if (!(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ message: "Login successful", token, user: sanitizeUser(user) });
  } catch (err) {
    console.error("loginUser error:", err);
    res.status(500).json({ error: "Login error", details: err.message });
  }
}

export async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ user: sanitizeUser(user) });
  } catch (err) {
    console.error("getMe error:", err);
    res.status(500).json({ error: "Error loading user", details: err.message });
  }
}

export async function updateProfileImage(req, res) {
  try {
    const { profileImage } = req.body;
    if (typeof profileImage !== "string" || profileImage.trim() === "") {
      return res.status(400).json({ error: "profileImage URL is required" });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { profileImage: profileImage.trim() },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({ message: "Profile image updated", user: sanitizeUser(user) });
  } catch (err) {
    console.error("updateProfileImage error:", err);
    res
      .status(500)
      .json({ error: "Error updating profile image", details: err.message });
  }
}
export async function deleteUser(req, res) {
  try {
    const userId = req.params.id;

    if (req.user.id !== userId) {
      return res
        .status(403)
        .json({ error: "You can only delete your own account" });
    }

    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({ message: "User deleted successfully" });
  } catch (err) {
    console.error("deleteUser error:", err);
    res
      .status(500)
      .json({ error: "Error deleting user", details: err.message });
  }
}
