import multer from "multer";
import sharp from "sharp";
import cloudinaryV2 from "../cloudinary.js";
import User from "../models/userModel.js";

export const identityUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 60 * 1024 * 1024 },
});

async function optimizeIdentityImage(buffer) {
  return sharp(buffer)
    .rotate()
    .resize({ width: 1800, withoutEnlargement: true })
    .webp({ quality: 78 })
    .toBuffer();
}

async function uploadIdentityImage(file, userId, kind) {
  const buffer = await optimizeIdentityImage(file.buffer);

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinaryV2.uploader.upload_stream(
      {
        folder: `identity-verifications/${userId}`,
        resource_type: "image",
        public_id: `${kind}-${Date.now()}`,
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

async function uploadIdentityVideo(file, userId) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinaryV2.uploader.upload_stream(
      {
        folder: `identity-verifications/${userId}`,
        resource_type: "video",
        public_id: `video-${Date.now()}`,
        overwrite: true,
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    );
    uploadStream.end(file.buffer);
  });
}

export async function submitManualIdentityVerification(req, res) {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: "User not found" });

    if (user.identityStatus === "verified") {
      return res.json({ status: "verified", user });
    }

    const documentFile = req.files?.document?.[0];
    const selfieFile = req.files?.selfie?.[0];
    const videoFile = req.files?.video?.[0];

    if (!documentFile || !selfieFile || !videoFile) {
      return res.status(400).json({
        error: "Document photo, selfie, and verification video are required",
      });
    }

    const [documentUrl, selfieUrl, videoUrl] = await Promise.all([
      uploadIdentityImage(documentFile, user._id.toString(), "document"),
      uploadIdentityImage(selfieFile, user._id.toString(), "selfie"),
      uploadIdentityVideo(videoFile, user._id.toString()),
    ]);

    user.identityStatus = "pending";
    user.identityProvider = "manual";
    user.identityVerificationId = `manual_${user._id}_${Date.now()}`;
    user.identityDocumentUrl = documentUrl;
    user.identitySelfieUrl = selfieUrl;
    user.identityVideoUrl = videoUrl;
    user.identityLastError = "";
    user.identitySubmittedAt = new Date();
    user.identityReviewedAt = null;
    user.identityVerifiedAt = null;
    await user.save();

    res.json({
      status: user.identityStatus,
      message: "Identity verification submitted for admin review",
    });
  } catch (err) {
    console.error("submitManualIdentityVerification error:", err);
    res.status(500).json({
      error: "Unable to submit identity verification",
      details: err.message,
    });
  }
}

export async function getIdentityStatus(req, res) {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ error: "User not found" });

    res.json({
      identityStatus: user.identityStatus || "not_started",
      identityProvider: user.identityProvider || null,
      identityVerifiedAt: user.identityVerifiedAt || null,
      identitySubmittedAt: user.identitySubmittedAt || null,
      identityVideoUrl: user.identityVideoUrl || "",
      identityLastError: user.identityLastError || "",
    });
  } catch (err) {
    console.error("getIdentityStatus error:", err);
    res.status(500).json({ error: "Unable to load identity status" });
  }
}
