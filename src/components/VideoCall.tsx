// @ts-nocheck

import React, {useState, useRef, useEffect} from 'react';

const VideoCall = () => {
    const [connected, setConnected] = useState(false);
    const [userId] = useState(`user_${Math.floor(Math.random() * 10000)}`);
    const [remoteVideos, setRemoteVideos] = useState([]);

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
                try {
                    const message = JSON.parse(event.data);
                    console.log('Получено сообщение:', message);

                    // Обрабатываем список пользователей - создаем соединения со всеми
                    if (message.type === 'user-list' && message.data && message.data.users) {
                        const otherUsers = message.data.users.filter(user => user !== userId);
                        console.log('Другие пользователи:', otherUsers);

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
                } catch (err) {
                    console.error('Ошибка при обработке сообщения:', err);
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

        try {
            const pc = new RTCPeerConnection({
                iceServers: [
                    {urls: 'stun:stun.l.google.com:19302'},
                    {urls: 'stun:stun1.l.google.com:19302'}
                ]
            });

            // Сохраняем соединение
            peerConnectionsRef.current[peerId] = pc;

            // Добавляем локальные треки
            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => {
                    pc.addTrack(track, localStreamRef.current);
                });
            }

            // Добавляем видео элемент для этого пира
            setRemoteVideos(prev => {
                // Проверяем, не добавлен ли уже этот пользователь
                if (!prev.find(p => p.id === peerId)) {
                    return [...prev, {id: peerId, stream: null}];
                }
                return prev;
            });

            // Обрабатываем входящие треки
            pc.ontrack = (event) => {
                console.log(`Получен трек от ${peerId}`, event.streams[0]);

                setRemoteVideos(prev => {
                    return prev.map(p => {
                        if (p.id === peerId) {
                            return {...p, stream: event.streams[0]};
                        }
                        return p;
                    });
                });
            };

            // Отправляем ICE кандидатов
            pc.onicecandidate = (event) => {
                if (event.candidate && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
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

            pc.oniceconnectionstatechange = () => {
                console.log(`ICE состояние для ${peerId}:`, pc.iceConnectionState);

                if (pc.iceConnectionState === 'disconnected' ||
                    pc.iceConnectionState === 'failed' ||
                    pc.iceConnectionState === 'closed') {
                    // Удаляем видео при разрыве соединения
                    setRemoteVideos(prev => prev.filter(p => p.id !== peerId));

                    // Удаляем соединение
                    if (peerConnectionsRef.current[peerId]) {
                        peerConnectionsRef.current[peerId].close();
                        delete peerConnectionsRef.current[peerId];
                    }
                }
            };

            // Если мы инициатор, создаем и отправляем оффер
            if (isInitiator) {
                pc.createOffer()
                    .then(offer => pc.setLocalDescription(offer))
                    .then(() => {
                        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                            socketRef.current.send(JSON.stringify({
                                type: 'offer',
                                to: peerId,
                                data: {sdp: pc.localDescription.sdp}
                            }));
                        } else {
                            console.error('WebSocket не подключен, невозможно отправить оффер');
                        }
                    })
                    .catch(err => console.error('Ошибка при создании оффера:', err));
            }

            return pc;
        } catch (err) {
            console.error(`Ошибка при создании соединения с ${peerId}:`, err);
            return null;
        }
    };

    // Обработка входящего оффера
    const handleOffer = async (message) => {
        const peerId = message.from;
        console.log(`Получен оффер от ${peerId}`);

        try {
            // Создаем соединение, если его еще нет
            let pc = peerConnectionsRef.current[peerId];
            if (!pc) {
                pc = createPeerConnection(peerId, false);
                if (!pc) return; // Если не удалось создать соединение
            }

            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: message.data.sdp
            }));

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                socketRef.current.send(JSON.stringify({
                    type: 'answer',
                    to: peerId,
                    data: {sdp: pc.localDescription.sdp}
                }));
            } else {
                console.error('WebSocket не подключен, невозможно отправить ответ');
            }
        } catch (err) {
            console.error('Ошибка при обработке оффера:', err);
        }
    };

    // Обработка входящего ответа
    const handleAnswer = async (message) => {
        const peerId = message.from;
        console.log(`Получен ответ от ${peerId}`);

        const pc = peerConnectionsRef.current[peerId];
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: message.data.sdp
                }));
            } catch (err) {
                console.error('Ошибка при обработке ответа:', err);
            }
        } else {
            console.error(`Нет соединения для ${peerId}`);
        }
    };

    // Обработка ICE кандидатов
    const handleIceCandidate = async (message) => {
        const peerId = message.from;
        console.log(`Получен ICE кандидат от ${peerId}`);

        const pc = peerConnectionsRef.current[peerId];
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
        } else {
            console.error(`Нет соединения для ${peerId}`);
        }
    };

    // Очистка соединений
    const cleanupConnections = () => {
        // Закрываем все peer connections
        Object.entries(peerConnectionsRef.current).forEach(([peerId, pc]) => {
            if (pc) {
                pc.close();
            }
        });
        peerConnectionsRef.current = {};

        // Останавливаем все треки
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
        }

        // Очищаем список видео
        setRemoteVideos([]);
    };

    // Обновление видео элементов при изменении потоков
    useEffect(() => {
        remoteVideos.forEach(peer => {
            const videoElement = document.getElementById(`video-${peer.id}`);
            if (videoElement && peer.stream) {
                videoElement.srcObject = peer.stream;
            }
        });
    }, [remoteVideos]);

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
                        style={{width: '320px', height: '240px', backgroundColor: '#000', borderRadius: '8px'}}
                    />
                </div>

                <div>
                    <h3>Участники комнаты ({remoteVideos.length})</h3>
                    <div style={{display: 'flex', flexWrap: 'wrap', gap: '10px'}}>
                        {remoteVideos.map(peer => (
                            <div key={peer.id} style={{marginBottom: '10px'}}>
                                <video
                                    id={`video-${peer.id}`}
                                    autoPlay
                                    playsInline
                                    style={{
                                        width: '240px',
                                        height: '180px',
                                        backgroundColor: '#000',
                                        borderRadius: '8px'
                                    }}
                                />
                                <div style={{textAlign: 'center', marginTop: '5px'}}>{peer.id}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VideoCall;
