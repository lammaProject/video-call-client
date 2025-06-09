// @ts-nocheck

import React, {useState, useRef, useEffect} from 'react';

const VideoCall = () => {
    const [connected, setConnected] = useState(false);
    const [userId] = useState(`user_${Math.floor(Math.random() * 10000)}`);
    const [peers, setPeers] = useState({});

    const socketRef = useRef(null);
    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const peerConnectionsRef = useRef({});

    // Подключение к серверу и инициализация медиа
    const connectToServer = async () => {
        try {
            // Получаем доступ к камере и микрофону
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            localStreamRef.current = stream;

            // Отображаем локальное видео
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            // Подключаемся к WebSocket серверу
            const socket = new WebSocket(`wss://video-chat-server-production.up.railway.app/ws?id=${userId}`);
            socketRef.current = socket;

            socket.onopen = () => {
                console.log('WebSocket подключен');
                setConnected(true);
            };

            socket.onmessage = (event) => {
                const message = JSON.parse(event.data);
                console.log('Получено сообщение:', message);

                // Обрабатываем список пользователей - создаем соединения со всеми
                if (message.type === 'user-list' && message.data && message.data.users) {
                    const otherUsers = message.data.users.filter(user => user !== userId);

                    // Для каждого нового пользователя создаем соединение
                    otherUsers.forEach(user => {
                        if (!peerConnectionsRef.current[user]) {
                            // Создаем соединение и отправляем оффер
                            createPeerConnection(user, true);
                        }
                    });
                }

                // Обрабатываем WebRTC сигналы
                if (message.type === 'offer' && message.from) {
                    handleOffer(message);
                }

                if (message.type === 'answer' && message.from) {
                    handleAnswer(message);
                }

                if (message.type === 'ice-candidate' && message.from) {
                    handleIceCandidate(message);
                }
            };

            socket.onerror = (error) => {
                console.error('WebSocket ошибка:', error);
            };

            socket.onclose = () => {
                console.log('WebSocket закрыт');
                setConnected(false);
                cleanupConnections();
            };
        } catch (err) {
            console.error('Ошибка:', err);
        }
    };

    // Создание WebRTC соединения
    const createPeerConnection = (peerId, isInitiator) => {
        console.log(`Создание соединения с ${peerId}, инициатор: ${isInitiator}`);

        const pc = new RTCPeerConnection({
            iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
        });

        // Сохраняем соединение
        peerConnectionsRef.current[peerId] = pc;

        // Добавляем локальные треки
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        // Создаем контейнер для видео, если его еще нет
        if (!document.getElementById(`video-${peerId}`)) {
            const videoContainer = document.getElementById('remote-videos');
            if (videoContainer) {
                const videoElement = document.createElement('video');
                videoElement.id = `video-${peerId}`;
                videoElement.autoplay = true;
                videoElement.playsInline = true;
                videoElement.style.width = '200px';
                videoElement.style.height = '150px';
                videoElement.style.margin = '5px';
                videoElement.style.backgroundColor = '#000';

                const label = document.createElement('div');
                label.textContent = peerId;
                label.style.textAlign = 'center';

                const wrapper = document.createElement('div');
                wrapper.id = `wrapper-${peerId}`;
                wrapper.style.display = 'inline-block';
                wrapper.appendChild(videoElement);
                wrapper.appendChild(label);

                videoContainer.appendChild(wrapper);

                // Обновляем состояние для ререндера
                setPeers(prev => ({...prev, [peerId]: true}));
            }
        }

        // Обрабатываем входящие треки
        pc.ontrack = (event) => {
            const videoElement = document.getElementById(`video-${peerId}`);
            if (videoElement) {
                videoElement.srcObject = event.streams[0];
            }
        };

        // Отправляем ICE кандидатов
        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current) {
                socketRef.current.send(JSON.stringify({
                    type: 'ice-candidate',
                    to: peerId,
                    data: {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex
                    }
                }));
            }
        };

        // Если мы инициатор, создаем и отправляем оффер
        if (isInitiator) {
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    if (socketRef.current) {
                        socketRef.current.send(JSON.stringify({
                            type: 'offer',
                            to: peerId,
                            data: {sdp: pc.localDescription.sdp}
                        }));
                    }
                })
                .catch(err => console.error('Ошибка при создании оффера:', err));
        }

        return pc;
    };

    // Обработка входящего оффера
    const handleOffer = async (message) => {
        const peerId = message.from;

        // Создаем соединение, если его еще нет
        let pc = peerConnectionsRef.current[peerId];
        if (!pc) {
            pc = createPeerConnection(peerId, false);
        }

        try {
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: message.data.sdp
            }));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            if (socketRef.current) {
                socketRef.current.send(JSON.stringify({
                    type: 'answer',
                    to: peerId,
                    data: {sdp: pc.localDescription.sdp}
                }));
            }
        } catch (err) {
            console.error('Ошибка при обработке оффера:', err);
        }
    };

    // Обработка входящего ответа
    const handleAnswer = async (message) => {
        const pc = peerConnectionsRef.current[message.from];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: message.data.sdp
                }));
            } catch (err) {
                console.error('Ошибка при обработке ответа:', err);
            }
        }
    };

    // Обработка ICE кандидатов
    const handleIceCandidate = async (message) => {
        const pc = peerConnectionsRef.current[message.from];
        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate({
                    candidate: message.data.candidate,
                    sdpMid: message.data.sdpMid,
                    sdpMLineIndex: message.data.sdpMLineIndex
                }));
            } catch (err) {
                console.error('Ошибка при добавлении ICE кандидата:', err);
            }
        }
    };

    // Очистка соединений
    const cleanupConnections = () => {
        // Закрываем все peer connections
        Object.values(peerConnectionsRef.current).forEach(pc => {
            if (pc) {
                pc.close();
            }
        });
        peerConnectionsRef.current = {};

        // Останавливаем все треки
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }

        // Очищаем видео элементы
        const videoContainer = document.getElementById('remote-videos');
        if (videoContainer) {
            videoContainer.innerHTML = '';
        }

        setPeers({});
    };

    // Очистка ресурсов при размонтировании
    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
            cleanupConnections();
        };
    }, []);

    return (
        <div style={{padding: '20px'}}>
            <h2>Групповой видеочат</h2>
            <p>Ваш ID: {userId}</p>

            {!connected ? (
                <button
                    onClick={connectToServer}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#4CAF50',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '16px'
                    }}
                >
                    Подключиться к комнате
                </button>
            ) : (
                <button
                    onClick={() => {
                        if (socketRef.current) {
                            socketRef.current.close();
                        }
                        cleanupConnections();
                        setConnected(false);
                    }}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: '#f44336',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '16px'
                    }}
                >
                    Отключиться
                </button>
            )}

            <div style={{marginTop: '20px'}}>
                <div style={{marginBottom: '20px'}}>
                    <h3>Ваше видео</h3>
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{width: '320px', height: '240px', backgroundColor: '#000'}}
                    />
                </div>

                <div>
                    <h3>Участники комнаты</h3>
                    <div id="remote-videos" style={{display: 'flex', flexWrap: 'wrap', gap: '10px'}}>
                        {/* Сюда будут динамически добавляться видео других участников */}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VideoCall;
