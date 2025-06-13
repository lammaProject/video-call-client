// @ts-nocheck

import React, { useEffect, useRef, useState, useCallback } from "react";

const VideoCall = ({ userId, wsUrl }) => {
  const [ws, setWs] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [connectedUsers, setConnectedUsers] = useState(new Set());

  const localVideoRef = useRef(null);
  const peerConnections = useRef(new Map());
  const remoteVideoRefs = useRef(new Map());

  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // Инициализация WebSocket
  useEffect(() => {
    const websocket = new WebSocket(`${wsUrl}?id=${userId}`);

    websocket.onopen = () => {
      console.log("WebSocket connected");
      setWs(websocket);
    };

    websocket.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      console.log("Received message:", data);

      switch (data.type) {
        case "register":
          // Получили список существующих пользователей
          if (data.clients) {
            Object.keys(data.clients).forEach((clientId) => {
              if (clientId !== userId) {
                setConnectedUsers((prev) => new Set([...prev, clientId]));
                createPeerConnection(clientId, true);
              }
            });
          }
          break;

        case "new-user":
          // Новый пользователь подключился
          const newUserId = Object.keys(data.clients)[0];
          if (newUserId && newUserId !== userId) {
            setConnectedUsers((prev) => new Set([...prev, newUserId]));
            // Не создаем соединение здесь - ждем offer от нового пользователя
          }
          break;

        case "user-left":
          // Пользователь отключился
          const leftUserId = Object.keys(data.clients)[0];
          handleUserLeft(leftUserId);
          break;

        case "videochat":
          await handleVideoChatMessage(data.data);
          break;
      }
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    websocket.onclose = () => {
      console.log("WebSocket disconnected");
      cleanup();
    };

    return () => {
      websocket.close();
      cleanup();
    };
  }, [userId, wsUrl]);

  // Получение локального видео
  useEffect(() => {
    const getLocalVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        setLocalStream(stream);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    getLocalVideo();

    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const createPeerConnection = useCallback(
    async (remoteUserId, createOffer = false) => {
      if (peerConnections.current.has(remoteUserId)) {
        return peerConnections.current.get(remoteUserId);
      }

      const pc = new RTCPeerConnection(configuration);
      peerConnections.current.set(remoteUserId, pc);

      // Добавляем локальные треки
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          pc.addTrack(track, localStream);
        });
      }

      // Обработка входящих треков
      pc.ontrack = (event) => {
        console.log("Received remote track from", remoteUserId);
        const [remoteStream] = event.streams;

        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.set(remoteUserId, remoteStream);
          return newMap;
        });
      };

      // Обработка ICE кандидатов
      pc.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "videochat",
              iceCandidate: {
                candidate: event.candidate.candidate,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                sdpMid: event.candidate.sdpMid,
              },
              to: remoteUserId,
            }),
          );
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          `ICE connection state with ${remoteUserId}: ${pc.iceConnectionState}`,
        );
      };

      // Создаем offer если нужно
      if (createOffer) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(
              JSON.stringify({
                type: "videochat",
                offer: {
                  type: offer.type,
                  sdp: offer.sdp,
                },
                to: remoteUserId,
              }),
            );
          }
        } catch (error) {
          console.error("Error creating offer:", error);
        }
      }

      return pc;
    },
    [localStream, ws],
  );

  const handleVideoChatMessage = async (data) => {
    const { from, offer, answer, iceCandidate } = data;

    if (offer) {
      // Получили offer - создаем peer connection и отправляем answer
      const pc = await createPeerConnection(from, false);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: "videochat",
              answer: {
                type: answer.type,
                sdp: answer.sdp,
              },
              to: from,
            }),
          );
        }
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    }

    if (answer) {
      // Получили answer
      const pc = peerConnections.current.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
          console.error("Error handling answer:", error);
        }
      }
    }

    if (iceCandidate) {
      // Получили ICE кандидата
      const pc = peerConnections.current.get(from);
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(iceCandidate));
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    }
  };

  const handleUserLeft = (userId) => {
    // Удаляем пользователя из списка подключенных
    setConnectedUsers((prev) => {
      const newSet = new Set(prev);
      newSet.delete(userId);
      return newSet;
    });

    // Закрываем peer connection
    const pc = peerConnections.current.get(userId);
    if (pc) {
      pc.close();
      peerConnections.current.delete(userId);
    }

    // Удаляем remote stream
    setRemoteStreams((prev) => {
      const newMap = new Map(prev);
      newMap.delete(userId);
      return newMap;
    });
  };

  const cleanup = () => {
    // Останавливаем локальный поток
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
    }

    // Закрываем все peer connections
    peerConnections.current.forEach((pc) => pc.close());
    peerConnections.current.clear();

    // Очищаем состояния
    setRemoteStreams(new Map());
    setConnectedUsers(new Set());
  };

  // Стили для видео сетки
  const containerStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "10px",
    padding: "20px",
    backgroundColor: "#1a1a1a",
    minHeight: "100vh",
  };

  const videoStyle = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "8px",
    backgroundColor: "#000",
  };

  const videoWrapperStyle = {
    position: "relative",
    paddingBottom: "56.25%", // 16:9 aspect ratio
    height: 0,
    overflow: "hidden",
    borderRadius: "8px",
    boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
  };

  const videoInnerStyle = {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
  };

  const labelStyle = {
    position: "absolute",
    bottom: "10px",
    left: "10px",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    color: "white",
    padding: "5px 10px",
    borderRadius: "4px",
    fontSize: "14px",
    zIndex: 1,
  };

  const statusStyle = {
    position: "fixed",
    top: "10px",
    right: "10px",
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    color: "white",
    padding: "10px",
    borderRadius: "4px",
    fontSize: "14px",
  };

  return (
    <div style={containerStyle}>
      <div style={statusStyle}>Connected users: {connectedUsers.size + 1}</div>

      {/* Локальное видео */}
      <div style={videoWrapperStyle}>
        <div style={videoInnerStyle}>
          <span style={labelStyle}>You ({userId})</span>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={videoStyle}
          />
        </div>
      </div>

      {/* Удаленные видео */}
      {Array.from(remoteStreams.entries()).map(([remoteUserId, stream]) => (
        <div key={remoteUserId} style={videoWrapperStyle}>
          <div style={videoInnerStyle}>
            <span style={labelStyle}>{remoteUserId}</span>
            <video
              ref={(el) => {
                if (el && stream) {
                  el.srcObject = stream;
                }
              }}
              autoPlay
              playsInline
              style={videoStyle}
            />
          </div>
        </div>
      ))}
    </div>
  );
};

export default VideoCall;
