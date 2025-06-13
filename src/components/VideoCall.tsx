// @ts-nocheck

import { useEffect, useRef, useState } from "react";
import image from "../assets/react.svg";
import type { AnswerType } from "./type.ts";

const configuration = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302",
    },
  ],
};

const userId = Math.random().toString(36).slice(-6);

const VideoCall = () => {
  const [connection, setConnection] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<AnswerType["messages"]>([]);
  const [textMessage, setTextMessage] = useState("");
  const [isVideoChat, setIsVideoChat] = useState(false);
  const [chatClients, setChatClients] = useState<Array<string>>([]);
  const [videoClients, setVideoClients] = useState<{
    [key: string]: MediaStream;
  }>({});
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const localStreamRef = useRef<HTMLVideoElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const peerConnectionsRef = useRef<{ [key: string]: RTCPeerConnection }>({});

  // Получение локального потока и подключение к серверу
  useEffect(() => {
    if (connection) {
      const connectToServer = async () => {
        try {
          // Инициализируем соединение при подключении
          socketRef.current = new WebSocket(
            `wss://video-chat-server-production.up.railway.app/ws?id=${userId}`,
          );

          socketRef.current.onopen = () => {
            console.log("Подключено к серверу");
          };

          socketRef.current.onmessage = async (event) => {
            try {
              const data = JSON.parse(event.data);
              console.log("Получено сообщение:", data);

              if (data.type === "register") {
                const clients = Object.keys(data.clients);
                setChatClients(clients);
                setChatMessages(data.messages);
              }

              if (data.type === "chat") {
                setChatMessages(data.messages);
              }

              if (data.type === "videochat") {
                const peerData = data?.data || {};
                console.log("Получены данные видеочата:", peerData);

                if (!peerRef.current && isVideoChat && localStream) {
                  // Если мы получили видео-сообщение, но соединение не инициализировано
                  console.log("Создаем новое соединение для входящего видео");
                  const newPeerConnection = createPeerConnection(localStream);
                  peerRef.current = newPeerConnection;
                }

                if (!peerRef.current) {
                  console.error(
                    "Получено видео-сообщение, но соединение не инициализировано",
                  );
                  return;
                }

                try {
                  if (peerData.offer) {
                    console.log("Получено предложение:", peerData.offer);
                    await peerRef.current.setRemoteDescription(
                      new RTCSessionDescription(peerData.offer),
                    );

                    const answer = await peerRef.current.createAnswer();
                    await peerRef.current.setLocalDescription(answer);

                    console.log("Отправляем ответ:", answer);
                    socketRef.current?.send(
                      JSON.stringify({
                        type: "videochat",
                        data: { answer: peerRef.current.localDescription },
                        userId: userId,
                      }),
                    );
                  }

                  if (peerData.answer) {
                    console.log("Получен ответ:", peerData.answer);
                    await peerRef.current.setRemoteDescription(
                      new RTCSessionDescription(peerData.answer),
                    );
                  }

                  if (peerData.iceCandidate) {
                    console.log("Получен ICE кандидат:", peerData.iceCandidate);
                    await peerRef.current.addIceCandidate(
                      new RTCIceCandidate(peerData.iceCandidate),
                    );
                  }
                } catch (error) {
                  console.error(
                    "Ошибка при обработке WebRTC сообщения:",
                    error,
                  );
                }
              }
            } catch (error) {
              console.error("Ошибка при обработке сообщения:", error);
            }
          };

          socketRef.current.onerror = (error) => {
            console.error("WebSocket ошибка:", error);
          };

          socketRef.current.onclose = (event) => {
            console.log("WebSocket закрыт:", event);
          };
        } catch (error) {
          console.error("Ошибка подключения:", error);
        }
      };

      void connectToServer();
    }

    return () => {
      // Очистка при размонтировании
      if (socketRef.current) {
        socketRef.current.close();
      }

      // Останавливаем все треки при размонтировании
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
      }

      // Закрываем все peer connections
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }

      Object.values(peerConnectionsRef.current).forEach((pc) => pc.close());
      peerConnectionsRef.current = {};
    };
  }, [connection, isVideoChat, localStream]);

  // Создание peer connection
  const createPeerConnection = (stream: MediaStream) => {
    console.log("Создаем новое peer connection");
    const peerConnection = new RTCPeerConnection(configuration);

    // Добавляем все треки из локального потока
    stream.getTracks().forEach((track) => {
      console.log("Добавляем трек в peer connection:", track.kind);
      peerConnection.addTrack(track, stream);
    });

    // Обработка входящих треков
    peerConnection.ontrack = (event) => {
      console.log("Получен удаленный трек:", event.streams);
      const remoteStream = event.streams[0];
      const streamId = Date.now() + Math.random().toString(36).substring(7);

      console.log("Добавляем удаленный поток:", streamId);
      setVideoClients((prev) => ({
        ...prev,
        [streamId]: remoteStream,
      }));
    };

    // Обработка ICE кандидатов
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("Отправляем ICE кандидат:", event.candidate);
        socketRef.current?.send(
          JSON.stringify({
            type: "videochat",
            data: { iceCandidate: event.candidate },
            userId,
          }),
        );
      }
    };

    // Логирование состояния соединения
    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE Connection State:", peerConnection.iceConnectionState);
    };

    peerConnection.onsignalingstatechange = () => {
      console.log("Signaling State:", peerConnection.signalingState);
    };

    return peerConnection;
  };

  // Инициализация камеры
  const initializeCamera = async () => {
    console.log("Инициализация камеры...");

    try {
      // Проверяем поддержку getUserMedia
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Ваш браузер не поддерживает API для доступа к камере");
      }

      // Проверяем доступные устройства
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === "videoinput",
      );

      if (videoDevices.length === 0) {
        throw new Error("Видеоустройства не обнаружены!");
      }

      console.log("Найдены видеоустройства:", videoDevices);

      // Запрашиваем доступ к камере
      console.log("Запрашиваем доступ к медиа...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      console.log("Доступ получен, stream:", stream);
      console.log("Stream active:", stream.active);
      console.log("Video tracks:", stream.getVideoTracks());

      // Привязываем поток к видео элементу
      if (localStreamRef.current) {
        localStreamRef.current.srcObject = stream;
        console.log("Поток привязан к видео элементу");
      }

      return stream;
    } catch (error) {
      console.error("Ошибка при инициализации камеры:", error);
      alert(`Не удалось получить доступ к камере: ${error.message}`);
      return null;
    }
  };

  const sendMessage = () => {
    if (!textMessage.trim() || !socketRef.current) return;
    socketRef.current.send(
      JSON.stringify({
        type: "chat",
        to: "chat",
        text: textMessage,
        from: userId,
      }),
    );
    setTextMessage("");
  };

  const handleConnect = () => {
    setConnection(true);
  };

  const handleDisconnect = () => {
    setConnection(false);

    // Останавливаем видео при отключении
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }

    // Закрываем WebSocket
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    // Закрываем peer connection
    if (peerRef.current) {
      peerRef.current.close();
      peerRef.current = null;
    }

    setIsVideoChat(false);
    setVideoClients({});
  };

  const handleVideoChat = async () => {
    if (isVideoChat) {
      // Выключаем видео
      if (localStream) {
        localStream.getTracks().forEach((track) => {
          console.log("Останавливаем трек:", track);
          track.stop();
        });
        setLocalStream(null);
      }

      if (localStreamRef.current) {
        localStreamRef.current.srcObject = null;
      }

      // Закрываем peer connection
      if (peerRef.current) {
        peerRef.current.close();
        peerRef.current = null;
      }

      setIsVideoChat(false);
      return;
    }

    // Включаем видео
    const stream = await initializeCamera();
    if (!stream) return;

    // Сохраняем поток в состоянии
    setLocalStream(stream);

    // Создаем peer connection
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      const peerConnection = createPeerConnection(stream);
      peerRef.current = peerConnection;

      // Создаем и отправляем предложение
      try {
        console.log("Создаем предложение");
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        console.log("Отправляем предложение:", offer);
        socketRef.current.send(
          JSON.stringify({
            type: "videochat",
            data: { offer: peerConnection.localDescription },
            userId,
          }),
        );
      } catch (err) {
        console.error("Ошибка при создании предложения:", err);
      }
    } else {
      console.error("WebSocket соединение не активно");
    }

    setIsVideoChat(true);
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Вы: {userId}</h2>

      {connection && (
        <>
          <h3>Локальное видео</h3>
          <video
            ref={localStreamRef}
            autoPlay
            playsInline
            muted // Важно для локального видео
            width={400}
            height={300}
            style={{ border: "1px solid #ccc", backgroundColor: "#f0f0f0" }}
          />

          <h3>Участники:</h3>
          <ul>
            {chatClients.map((user) => (
              <li key={user}>{user}</li>
            ))}
          </ul>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {Object.entries(videoClients).map(([clientId, stream]) => (
              <div key={clientId} style={{ margin: "10px" }}>
                <video
                  autoPlay
                  playsInline
                  width={400}
                  height={300}
                  ref={(el) => {
                    if (el && el.srcObject !== stream) {
                      el.srcObject = stream;
                    }
                  }}
                  poster={image}
                />
                <p>ID: {clientId}</p>
              </div>
            ))}
          </div>

          <button onClick={handleVideoChat}>
            {isVideoChat ? "Отключить видео" : "Подключить видео"}
          </button>
        </>
      )}

      {connection && chatMessages && Boolean(chatMessages?.length) && (
        <div>
          <div style={{ marginTop: "20px" }}>
            <h4>Чат:</h4>
            {chatMessages.map((msg, idx) => (
              <p key={idx}>
                <strong>{msg.from}:</strong> {msg.text}
              </p>
            ))}
          </div>

          <div style={{ marginTop: "20px" }}>
            <input
              value={textMessage}
              onChange={(e) => setTextMessage(e.target.value)}
              placeholder="Введите сообщение"
            />
            <button
              disabled={socketRef.current?.readyState === 3}
              onClick={sendMessage}
            >
              Отправить
            </button>
          </div>
        </div>
      )}

      <button onClick={connection ? handleDisconnect : handleConnect}>
        {connection ? "Отключиться" : "Подключиться"}
      </button>
    </div>
  );
};

export default VideoCall;
