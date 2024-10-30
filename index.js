const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

app.use(express.static("public"));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

const rooms = new Map();

io.on("connection", (socket) => {
  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    const peers = rooms.get(roomId);
    peers.add(socket.id);

    // 기존 피어들에게 새 피어 알림
    socket.to(roomId).emit("peer-joined", socket.id);

    // 새 피어에게 기존 피어 목록 전송
    socket.emit(
      "peers-in-room",
      Array.from(peers).filter((id) => id !== socket.id)
    );
  });

  socket.on("offer", ({ offer, targetId }) => {
    socket.to(targetId).emit("offer", { offer, sourceId: socket.id });
  });

  socket.on("answer", ({ answer, targetId }) => {
    socket.to(targetId).emit("answer", { answer, sourceId: socket.id });
  });

  socket.on("ice-candidate", ({ candidate, targetId }) => {
    socket
      .to(targetId)
      .emit("ice-candidate", { candidate, sourceId: socket.id });
  });

  socket.on("disconnect", () => {
    rooms.forEach((participants, roomId) => {
      if (participants.has(socket.id)) {
        participants.delete(socket.id);
        if (participants.size === 0) {
          rooms.delete(roomId);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
