// @ts-nocheck

import React, { useEffect, useRef, useState, useCallback } from "react";

const VideoCall = ({ userId, wsUrl }) => {
  const [ws, setWs] = useState(null);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [connectedUsers, setConnectedUsers] = useState(new Set());
  const [isReady, setIsReady] = useState(false);

  const localVideoRef = useRef(null);
  const peerConnections = useRef(new Map());
  const wsRef = useRef(null);
  const localStreamRef = useRef(null);

  const configuration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };

  // Получение локального видео - только один раз при монтировании
  useEffect(() => {
    let mounted = true;

    const getLocalVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });

        if (mounted) {
          localStreamRef.current = stream;
          setLocalStream(stream);

          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
          }

          setIsReady(true);
        }
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    getLocalVideo();

    return () => {
      mounted = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, []); // Пустой массив зависимостей - выполняется только один раз

  // Обновляем видео элемент когда получаем поток
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Инициализация WebSocket только после получения локального видео
  useEffect(() => {
    if (!isReady || !localStreamRef.current) return;

    const websocket = new WebSocket(`${wsUrl}?id=${userId}`);
    wsRef.current = websocket;

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
            for (const clientId of Object.keys(data.clients)) {
              if (clientId !== userId && data.clients[clientId]) {
                console.log("Creating offer for existing user:", clientId);
                setConnectedUsers((prev) => new Set([...prev, clientId]));
                await createPeerConnection(clientId, true);
              }
            }
          }
          break;

        case "new-user":
          // Новый пользователь подключился - ждем offer от него
          const newUserId = Object.keys(data.clients).find(
            (id) => data.clients[id],
          );
          if (newUserId && newUserId !== userId) {
            console.log("New user connected:", newUserId);
            setConnectedUsers((prev) => new Set([...prev, newUserId]));
          }
          break;

        case "user-left":
          // Пользователь отключился
          const leftUserId = Object.keys(data.clients).find(
            (id) => !data.clients[id],
          );
          if (leftUserId) {
            handleUserLeft(leftUserId);
          }
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
    };
  }, [isReady, userId, wsUrl]); // Убрали localStream из зависимостей

  const createPeerConnection = useCallback(
    async (remoteUserId, createOffer = false) => {
      console.log(
        `Creating peer connection for ${remoteUserId}, createOffer: ${createOffer}`,
      );

      if (peerConnections.current.has(remoteUserId)) {
        console.log("Peer connection already exists for", remoteUserId);
        return peerConnections.current.get(remoteUserId);
      }

      const pc = new RTCPeerConnection(configuration);
      peerConnections.current.set(remoteUserId, pc);

      // Добавляем локальные треки
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          console.log(
            `Adding ${track.kind} track to peer connection for ${remoteUserId}`,
          );
          pc.addTrack(track, localStreamRef.current);
        });
      }

      // Обработка входящих треков
      pc.ontrack = (event) => {
        console.log(`Received ${event.track.kind} track from ${remoteUserId}`);
        const [remoteStream] = event.streams;

        setRemoteStreams((prev) => {
          const newMap = new Map(prev);
          newMap.set(remoteUserId, remoteStream);
          return newMap;
        });
      };

      // Обработка ICE кандидатов
      pc.onicecandidate = (event) => {
        if (
          event.candidate &&
          wsRef.current &&
          wsRef.current.readyState === WebSocket.OPEN
        ) {
          console.log("Sending ICE candidate to", remoteUserId);
          wsRef.current.send(
            JSON.stringify({
              type: "videochat",
              iceCandidate: {
                candidate: event.candidate.candidate,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                sdpMid: event.candidate.sdpMid,
                usernameFragment: event.candidate.usernameFragment,
              },
              to: remoteUserId,
              from: userId,
            }),
          );
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(
          `ICE connection state with ${remoteUserId}: ${pc.iceConnectionState}`,
        );
      };

      pc.onconnectionstatechange = () => {
        console.log(
          `Connection state with ${remoteUserId}: ${pc.connectionState}`,
        );
      };

      // Создаем offer если нужно
      if (createOffer) {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            console.log("Sending offer to", remoteUserId);
            wsRef.current.send(
              JSON.stringify({
                type: "videochat",
                offer: {
                  type: offer.type,
                  sdp: offer.sdp,
                },
                to: remoteUserId,
                from: userId,
              }),
            );
          }
        } catch (error) {
          console.error("Error creating offer:", error);
        }
      }

      return pc;
    },
    [userId],
  ); // Убрали localStream из зависимостей, используем ref

  const handleVideoChatMessage = async (data) => {
    console.log("Handling video chat message:", data);
    const { from, offer, answer, iceCandidate } = data;

    if (offer) {
      console.log("Received offer from", from);
      // Получили offer - создаем peer connection и отправляем answer
      const pc = await createPeerConnection(from, false);

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answerDesc = await pc.createAnswer();
        await pc.setLocalDescription(answerDesc);

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          console.log("Sending answer to", from);
          wsRef.current.send(
            JSON.stringify({
              type: "videochat",
              answer: {
                type: answerDesc.type,
                sdp: answerDesc.sdp,
              },
              to: from,
              from: userId,
            }),
          );
        }
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    }

    if (answer) {
      console.log("Received answer from", from);
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
      console.log("Received ICE candidate from", from);
      // Получили ICE кандидата
      const pc = peerConnections.current.get(from);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(
            new RTCIceCandidate({
              candidate: iceCandidate.candidate,
              sdpMLineIndex: iceCandidate.sdpMLineIndex,
              sdpMid: iceCandidate.sdpMid,
            }),
          );
        } catch (error) {
          console.error("Error adding ICE candidate:", error);
        }
      }
    }
  };

  const handleUserLeft = (userId) => {
    console.log("User left:", userId);
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

  if (!isReady) {
    return (
      <div
        style={{
          ...containerStyle,
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div style={{ color: "white" }}>Initializing camera...</div>
      </div>
    );
  }

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
