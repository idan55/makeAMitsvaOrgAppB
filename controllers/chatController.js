import Chat from "../models/chatModel.js";
import User from "../models/userModel.js";
import { Request } from "../models/requestModel.js";
import { v2 as cloudinaryV2 } from "cloudinary";
import multer from "multer";
import sharp from "sharp";
import {
  createChatMessage,
  getChatForParticipant,
  sanitizeChatMessages,
} from "../services/chatService.js";
import { emitChatClosed, emitChatMessage } from "../socket.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});
export const chatUploadMiddleware = upload.single("file");

export const getMessagesByChatId = async (req, res) => {
  try {
    const chat = await getChatForParticipant(req.params.chatId, req.user.id);
    const sanitizedMessages = sanitizeChatMessages(chat);

    const currentUserId = String(req.user.id);
    const hasFlagged = (chat.flags || []).some(
      (flag) => String(flag.from) === currentUserId
    );

    res.json({ messages: sanitizedMessages, isClosed: chat.isClosed, hasFlagged });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const postMessageToChat = async (req, res) => {
  try {
    const result = await createChatMessage({
      chatId: req.params.chatId,
      userId: req.user.id,
      text: req.body?.text,
      attachments: req.body?.attachments,
    });
    emitChatMessage(result.chat, result.event);

    return res.status(201).json({
      message: result.message,
    });
  } catch (err) {
    return res
      .status(err.statusCode || 500)
      .json({ error: err.message || "Failed to send message" });
  }
};

export const uploadChatMedia = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const isImage = req.file.mimetype?.startsWith("image/");
    let optimizedBuffer = req.file.buffer;

    if (isImage) {
      try {
        optimizedBuffer = await sharp(req.file.buffer)
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 70 })
          .toBuffer();
      } catch (e) {
        console.warn(
          "Chat image optimization failed, sending original buffer:",
          e.message
        );
      }
    }

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinaryV2.uploader.upload_stream(
        { folder: "chat-media", resource_type: "auto" },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
      stream.end(optimizedBuffer);
    });

    const type =
      uploadResult.resource_type === "video"
        ? "video"
        : uploadResult.format?.match(/(jpg|jpeg|png|gif|webp)/i)
        ? "image"
        : "file";

    return res.json({
      url: uploadResult.secure_url,
      publicId: uploadResult.public_id,
      type,
      originalName: req.file.originalname,
    });
  } catch (err) {
    console.error("uploadChatMedia error:", err);
    return res.status(500).json({ error: err.message });
  }
};

export const startChat = async (req, res) => {
  try {
    const { otherUserId, requestId } = req.body;
    const currentUserId = req.user.id;

    if (!otherUserId)
      return res.status(400).json({ error: "otherUserId is required" });
    if (!requestId)
      return res.status(400).json({ error: "requestId is required" });

    if (otherUserId === currentUserId) {
      return res.status(400).json({ error: "Cannot start chat with yourself" });
    }

    const request = await Request.findById(requestId);
    if (!request) return res.status(404).json({ error: "Request not found" });

    const participants = [currentUserId, otherUserId].sort();

    let chat = await Chat.findOne({
      participants: { $all: participants, $size: participants.length },
      request: requestId,
    });

    if (!chat) {
      chat = await Chat.create({
        participants,
        request: requestId,
        messages: [],
      });
    }

    return res.json({ chatId: chat._id, chat });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const listMyChats = async (req, res) => {
  try {
    const userId = req.user.id;
    const chats = await Chat.find({ participants: userId })
      .sort({ updatedAt: -1 })
      .populate("participants", "name email profileImage")
      .populate("request", "title createdBy completedBy");

    const formatted = chats.map((chat) => {
      const lastMessageRaw = chat.messages[chat.messages.length - 1] || null;
      const lastMessage =
        lastMessageRaw && !lastMessageRaw.sender
          ? {
              ...lastMessageRaw.toObject(),
              sender: { _id: "deleted", name: "Deleted user" },
            }
          : lastMessageRaw;

      const safeParticipants = (chat.participants || []).map((p) => {
        if (p) return p;
        return { _id: "deleted", name: "Deleted user" };
      });

      return {
        id: chat._id,
        requestId: chat.request?._id || null,
        requestTitle: chat.request?.title || "Request",
        participants: safeParticipants,
        lastMessage,
        updatedAt: chat.updatedAt,
        isClosed: chat.isClosed,
      };
    });

    res.json({ chats: formatted });
  } catch (err) {
    console.error("listMyChats error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const flagUserInChat = async (req, res) => {
  try {
    const { chatId } = req.params;
    const { targetUserId } = req.body;
    const currentUserId = req.user.id;

    if (!targetUserId) {
      return res.status(400).json({ error: "targetUserId is required" });
    }

    if (targetUserId === currentUserId) {
      return res.status(400).json({ error: "You cannot flag yourself" });
    }

    const chat = await Chat.findById(chatId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });

    const participants = (chat.participants || []).map((p) => String(p));
    if (!participants.includes(String(currentUserId))) {
      return res.status(403).json({ error: "Not a participant of this chat" });
    }
    if (!participants.includes(String(targetUserId))) {
      return res.status(400).json({ error: "Target user is not in this chat" });
    }

    const alreadyFlagged = (chat.flags || []).some(
      (flag) =>
        String(flag.from) === String(currentUserId) &&
        String(flag.to) === String(targetUserId)
    );
    if (alreadyFlagged) {
      return res.status(409).json({ error: "You already flagged this user" });
    }

    chat.flags = chat.flags || [];
    chat.flags.push({
      from: currentUserId,
      to: targetUserId,
      createdAt: new Date(),
    });
    chat.isClosed = true;
    await chat.save();
    emitChatClosed(chat);

    const updated = await User.findByIdAndUpdate(
      targetUserId,
      { $inc: { flagsCount: 1 }, $set: { lastFlaggedAt: new Date() } },
      { new: true }
    ).select("_id flagsCount lastFlaggedAt");

    if (!updated) return res.status(404).json({ error: "User not found" });

    if (chat.request) {
      await Request.findByIdAndUpdate(chat.request, {
        isCompleted: true,
        expiresAt: null,
      });
    }

    return res.json({
      message: "User flagged",
      user: updated,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
