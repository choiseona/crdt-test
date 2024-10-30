const socket = io();
const crdt = new CRDT();
const canvas = new DrawingCanvas("canvas");
const colorPicker = document.getElementById("colorPicker");
const brushSize = document.getElementById("brushSize");
const brushSizeValue = document.getElementById("brushSizeValue");
const connectionStatus = document.getElementById("connectionStatus");

const peerConnections = new Map();
const dataChannels = new Map();
let currentRoom;

function updateConnectionStatus(status) {
  connectionStatus.textContent = status;
}

function joinRoom() {
  const roomId = document.getElementById("roomId").value;
  if (!roomId) return alert("Please enter a room ID");

  // 기존 연결 정리
  peerConnections.forEach((pc) => pc.close());
  peerConnections.clear();
  dataChannels.forEach((dc) => dc.close());
  dataChannels.clear();

  currentRoom = roomId;
  socket.emit("join-room", roomId);
  updateConnectionStatus("Joining room...");
}

socket.on("peers-in-room", async (peerIds) => {
  console.log("Existing peers:", peerIds);
  for (const peerId of peerIds) {
    await createPeerConnection(peerId, true);
  }
});

socket.on("peer-joined", async (peerId) => {
  console.log("New peer joined:", peerId);
  await createPeerConnection(peerId, false);
});

async function createPeerConnection(peerId, initiator) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  peerConnections.set(peerId, pc);

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) {
      socket.emit("ice-candidate", {
        candidate,
        targetId: peerId,
        roomId: currentRoom,
      });
    }
  };

  pc.onconnectionstatechange = () => {
    console.log(`Connection state with ${peerId}: ${pc.connectionState}`);
    updateConnectionStatus(`Connection: ${pc.connectionState}`);
  };

  if (initiator) {
    const dc = pc.createDataChannel("drawings", {
      ordered: true,
    });
    setupDataChannel(dc, peerId);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", {
        offer,
        targetId: peerId,
        roomId: currentRoom,
      });
    } catch (error) {
      console.error("Error creating offer:", error);
    }
  }

  pc.ondatachannel = (event) => {
    console.log("Received data channel");
    setupDataChannel(event.channel, peerId);
  };

  return pc;
}

function setupDataChannel(channel, peerId) {
  channel.onopen = () => {
    console.log(`DataChannel with ${peerId} opened`);
    updateConnectionStatus("Connected to peer");
    dataChannels.set(peerId, channel);

    // 연결 시 현재까지의 모든 그림 전송
    crdt.drawings.forEach((drawing) => {
      channel.send(JSON.stringify(drawing));
    });
  };

  channel.onclose = () => {
    console.log(`DataChannel with ${peerId} closed`);
    updateConnectionStatus("Disconnected from peer");
    dataChannels.delete(peerId);
  };

  channel.onerror = (error) => {
    console.error(`DataChannel error with ${peerId}:`, error);
  };

  channel.onmessage = (event) => {
    const drawing = JSON.parse(event.data);
    if (crdt.merge(drawing)) {
      canvas.drawPath(drawing.points, drawing.color, drawing.size);
    }
  };
}

socket.on("offer", async ({ offer, sourceId }) => {
  console.log("Received offer from:", sourceId);
  const pc =
    peerConnections.get(sourceId) ||
    (await createPeerConnection(sourceId, false));

  try {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit("answer", {
      answer,
      targetId: sourceId,
      roomId: currentRoom,
    });
  } catch (error) {
    console.error("Error handling offer:", error);
  }
});

socket.on("answer", async ({ answer, sourceId }) => {
  console.log("Received answer from:", sourceId);
  const pc = peerConnections.get(sourceId);
  if (pc) {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
      console.error("Error handling answer:", error);
    }
  }
});

socket.on("ice-candidate", async ({ candidate, sourceId }) => {
  const pc = peerConnections.get(sourceId);
  if (pc) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error("Error adding ICE candidate:", error);
    }
  }
});

socket.on("user-left", (userId) => {
  console.log("User left:", userId);
  const pc = peerConnections.get(userId);
  if (pc) {
    pc.close();
    peerConnections.delete(userId);
  }
  const dc = dataChannels.get(userId);
  if (dc) {
    dc.close();
    dataChannels.delete(userId);
  }
});

// Canvas event listeners
canvas.canvas.addEventListener("mousedown", startDraw);
canvas.canvas.addEventListener("mousemove", draw);
canvas.canvas.addEventListener("mouseup", stopDraw);
canvas.canvas.addEventListener("mouseout", stopDraw);

brushSize.addEventListener("input", (e) => {
  brushSizeValue.textContent = e.target.value;
});

function startDraw(e) {
  const rect = canvas.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  canvas.startDrawing(x, y, colorPicker.value, brushSize.value);
}

function draw(e) {
  const rect = canvas.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  const tempDrawing = canvas.draw(x, y);

  if (tempDrawing) {
    const currentDrawing = {
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      points: tempDrawing.points,
      color: tempDrawing.color,
      size: tempDrawing.size,
      timestamp: Date.now(),
    };

    // 다른 피어들에게 실시간으로 그리기 상태 전송
    dataChannels.forEach((channel) => {
      if (channel.readyState === "open") {
        channel.send(JSON.stringify(currentDrawing));
      }
    });
  }
}

function stopDraw() {
  const points = canvas.stopDrawing();
  if (points && points.length > 0) {
    const drawing = crdt.addDrawing(points, colorPicker.value, brushSize.value);
    dataChannels.forEach((channel) => {
      if (channel.readyState === "open") {
        channel.send(JSON.stringify(drawing));
      }
    });
  }
}

// 디버깅을 위한 소켓 이벤트 리스너
socket.on("connect", () => {
  console.log("Connected to server");
  updateConnectionStatus("Connected to server");
});

socket.on("disconnect", () => {
  console.log("Disconnected from server");
  updateConnectionStatus("Disconnected from server");
});
