import { Server } from "socket.io";
import Chat from "./models/chatModel.js";
import { authenticateSocketToken } from "./middleware/authMiddleware.js";
import { createChatMessage } from "./services/chatService.js";

let io;

export function userRoom(userId) {
  return `user:${userId}`;
}

export function chatRoom(chatId) {
  return `chat:${chatId}`;
}

function emitToChatParticipants(chat, eventName, payload) {
  const participantIds = (chat.participants || []).map((participant) =>
    String(participant?._id || participant)
  );

  participantIds.forEach((participantId) => {
    io.to(userRoom(participantId)).emit(eventName, payload);
  });

  io.to(chatRoom(payload.chatId)).emit(eventName, payload);
}

export function initSocketServer(server, allowedOrigins) {
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(" ")[1];

      if (!token) {
        return next(new Error("Access denied, token missing"));
      }

      socket.data.user = await authenticateSocketToken(token);
      next();
    } catch (error) {
      next(error);
    }
  });

  io.on("connection", (socket) => {
    const currentUserId = socket.data.user.id;
    socket.join(userRoom(currentUserId));

    socket.on("chat:join", async ({ chatId }, ack = () => {}) => {
      try {
        const chat = await Chat.findById(chatId).select("participants");
        if (!chat) {
          return ack({ error: "Chat not found" });
        }

        const participants = (chat.participants || []).map((participant) =>
          String(participant)
        );
        if (!participants.includes(String(currentUserId))) {
          return ack({ error: "Not a participant of this chat" });
        }

        socket.join(chatRoom(chatId));
        ack({ ok: true });
      } catch (error) {
        ack({ error: error.message || "Failed to join chat" });
      }
    });

    socket.on("chat:leave", ({ chatId }) => {
      if (chatId) {
        socket.leave(chatRoom(chatId));
      }
    });

    socket.on("chat:send-message", async (payload, ack = () => {}) => {
      try {
        const result = await createChatMessage({
          chatId: payload?.chatId,
          userId: currentUserId,
          text: payload?.text,
          attachments: payload?.attachments,
        });

        emitToChatParticipants(result.chat, "chat:message", result.event);
        ack({ ok: true, message: result.message });
      } catch (error) {
        ack({
          error: error.message || "Failed to send message",
          statusCode: error.statusCode || 500,
        });
      }
    });
  });

  return io;
}

export function emitChatMessage(chat, payload) {
  if (!io) return;
  emitToChatParticipants(chat, "chat:message", payload);
}

export function emitChatClosed(chat) {
  if (!io) return;
  emitToChatParticipants(chat, "chat:closed", {
    chatId: chat._id.toString(),
    requestId: chat.request?.toString?.() || null,
    isClosed: true,
  });
}
