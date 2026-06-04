import Chat from "../models/chatModel.js";

function normalizeAttachments(attachments) {
  return Array.isArray(attachments)
    ? attachments
        .map((attachment) => ({
          url: attachment?.url,
          type: attachment?.type || "file",
          publicId: attachment?.publicId,
          originalName: attachment?.originalName,
        }))
        .filter((attachment) => attachment.url)
    : [];
}

function sanitizeMessage(message) {
  if (message?.sender) return message;
  return {
    ...message.toObject(),
    sender: { _id: "deleted", name: "Deleted user" },
  };
}

function serializeParticipant(participant) {
  if (participant) return participant;
  return { _id: "deleted", name: "Deleted user" };
}

export async function getChatForParticipant(chatId, userId) {
  const chat = await Chat.findById(chatId).populate("messages.sender");
  if (!chat) {
    const error = new Error("Chat not found");
    error.statusCode = 404;
    throw error;
  }

  const participants = (chat.participants || []).map((participant) =>
    String(participant)
  );
  if (!participants.includes(String(userId))) {
    const error = new Error("Not a participant of this chat");
    error.statusCode = 403;
    throw error;
  }

  return chat;
}

export async function createChatMessage({
  chatId,
  userId,
  text = "",
  attachments = [],
}) {
  const trimmedText = String(text || "").trim();
  const parsedAttachments = normalizeAttachments(attachments);

  if (!trimmedText && parsedAttachments.length === 0) {
    const error = new Error("Message must have text or attachment");
    error.statusCode = 400;
    throw error;
  }

  const chat = await Chat.findById(chatId);
  if (!chat) {
    const error = new Error("Chat not found");
    error.statusCode = 404;
    throw error;
  }

  const participants = (chat.participants || []).map((participant) =>
    String(participant)
  );
  if (!participants.includes(String(userId))) {
    const error = new Error("Not a participant of this chat");
    error.statusCode = 403;
    throw error;
  }

  if (chat.isClosed) {
    const error = new Error("Chat is closed");
    error.statusCode = 403;
    throw error;
  }

  chat.messages.push({
    sender: userId,
    text: trimmedText,
    attachments: parsedAttachments,
    createdAt: new Date(),
  });
  await chat.save();

  await chat.populate([
    { path: "messages.sender", select: "name email profileImage" },
    { path: "participants", select: "name email profileImage" },
    { path: "request", select: "title" },
  ]);

  const rawMessage = chat.messages[chat.messages.length - 1];
  const message = sanitizeMessage(rawMessage);

  return {
    chat,
    message,
    event: {
      chatId: chat._id.toString(),
      requestId: chat.request?._id?.toString?.() || null,
      requestTitle: chat.request?.title || "Request",
      participants: (chat.participants || []).map(serializeParticipant),
      message,
      updatedAt: chat.updatedAt,
      isClosed: chat.isClosed,
    },
  };
}

export function sanitizeChatMessages(chat) {
  return (chat.messages || []).map(sanitizeMessage);
}
