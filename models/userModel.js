import mongoose from "mongoose";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import validator from "validator";

export function normalizePhone(phone) {
  if (!phone) return phone;

  let value = String(phone).trim();
  if (value.startsWith("00")) value = "+" + value.slice(2);

  const parsed = parsePhoneNumberFromString(value);
  if (!parsed || !parsed.isValid()) return null;

  return parsed.number;
}

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, lowercase: true, trim: true },
    age: { type: Number, required: true, min: 16, max: 120 },
    email: {
      type: String,
      required: true,
      validate: [validator.isEmail, "Invalid email"],
      lowercase: true,
      trim: true,
      unique: true,
    },
    password: { type: String, required: true, trim: true },
    phone: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      set: (phone) => normalizePhone(phone) ?? phone,
      validate: {
        validator: (phone) => Boolean(normalizePhone(phone)),
        message: "Invalid phone number format",
      },
    },
    stars: { type: Number, default: 0 },
    couponEarned: { type: Boolean, default: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    isBanned: { type: Boolean, default: false },
    flagsCount: { type: Number, default: 0 },
    lastFlaggedAt: { type: Date, default: null },
    profileImage: { type: String, default: "" },
    identityStatus: {
      type: String,
      enum: ["not_started", "pending", "verified", "failed"],
      default: "not_started",
    },
    identityProvider: {
      type: String,
      enum: ["manual", null],
      default: null,
    },
    identityVerificationId: { type: String, default: null },
    identityDocumentUrl: { type: String, default: "" },
    identitySelfieUrl: { type: String, default: "" },
    identityVideoUrl: { type: String, default: "" },
    identityLastError: { type: String, default: "" },
    identitySubmittedAt: { type: Date, default: null },
    identityReviewedAt: { type: Date, default: null },
    identityVerifiedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
