import React, {useState, useRef, useEffect} from 'react';

const VideoCall = () => {
    const [connected, setConnected] = useState(false);
    const [userId] = useState(`user_${Math.floor(Math.random() * 10000)}`);
    const [remoteVideos, setRemoteVideos] = useState([]);
    const [connectionStatus, setConnectionStatus] = useState('');

    const socketRef = useRef(null);
    const localVideoRef = useRef(null);
    const localStreamRef = useRef(null);
    const peerConnectionsRef = useRef({});

    // Функция для логирования с временной меткой
    const log = (message, data) => {
        const timestamp = new Date().toISOString().substr(11, 8);
        console.log(`[${timestamp}] ${message}`, data || '');
        setConnectionStatus(prev => `${timestamp}: ${message}\n${prev}`.slice(0, 500));
    };

    // Безопасная отправка сообщений через WebSocket
    const safeSend = (message) => {
        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
            log('WebSocket не готов для отправки');
            return false;
        }

        try {
            // Ограничиваем размер сообщения
            const messageStr = JSON.stringify(message);
            if (messageStr.length > 8000) {
                log('Сообщение слишком большое, обрезаем');
                // Для ICE кандидатов можно просто пропустить
                if (message.type === 'ice-candidate') {
                    return false;
                }
            }

            socketRef.current.send(messageStr);
            return true;
        } catch (err) {
            log('Ошибка при отправке сообщения', err.message);
            return false;
        }
    };

    // Подключение к серверу и инициализация медиа
    const connectToServer = async () => {
        try {
            log('Запрашиваем доступ к медиа...');

            // Получаем доступ к камере и микрофону с ограничениями
            const constraints = {
                video: {
                    width: {ideal: 320},
                    height: {ideal: 240},
                    frameRate: {max: 15}
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);

            log('Доступ к медиа получен');
            localStreamRef.current = stream;

            // Отображаем локальное видео
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            // Подключаемся к WebSocket серверу
            log('Подключаемся к WebSocket...');
            const wsUrl = `wss://video-chat-server-production.up.railway.app/ws?id=${userId}`;
            log(`URL: ${wsUrl}`);

            const socket = new WebSocket(wsUrl);
            socketRef.current = socket;

            socket.onopen = () => {
                log('WebSocket подключен');
                setConnected(true);
            };

            socket.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    log('Получено сообщение', message.type);

                    // Обрабатываем список пользователей - создаем соединения со всеми
                    if (message.type === 'user-list' && message.data && message.data.users) {
                        const otherUsers = message.data.users.filter(user => user !== userId);
                        log('Другие пользователи', otherUsers);

                        // Для каждого нового пользователя создаем соединение с задержкой
                        otherUsers.forEach((user, index) => {
                            if (!peerConnectionsRef.current[user]) {
                                // Добавляем задержку между созданием соединений
                                setTimeout(() => {
                                    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                                        createPeerConnection(user, true);
                                    }
                                }, index * 2000); // 2 секунды между соединениями
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
                    log('Ошибка при обработке сообщения', err.message);
                }
            };

            socket.onerror = (error) => {
                log('WebSocket ошибка', error);
            };

            socket.onclose = (event) => {
                log(`WebSocket закрыт: код ${event.code}, причина: ${event.reason}`);
                setConnected(false);
                cleanupConnections();
            };

            // Пинг для поддержания соединения
            const pingInterval = setInterval(() => {
                if (socket.readyState === WebSocket.OPEN) {
                    socket.send(JSON.stringify({type: 'ping'}));
                }
            }, 30000); // каждые 30 секунд

            // Очистка интервала при размонтировании
            return () => clearInterval(pingInterval);

        } catch (err) {
            log('Ошибка при подключении', err.message);
        }
    };

    // Создание WebRTC соединения
    const createPeerConnection = (peerId, isInitiator) => {
        log(`Создание соединения с ${peerId}, инициатор: ${isInitiator}`);

        try {
            // Упрощенная конфигурация с минимумом STUN серверов
            const pc = new RTCPeerConnection({
                iceServers: [
                    {urls: 'stun:stun.l.google.com:19302'}
                ],
                // Ограничиваем количество ICE кандидатов
                iceTransportPolicy: 'all',
                iceCandidatePoolSize: 2
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
                if (!prev.find(p => p.id === peerId)) {
                    return [...prev, {id: peerId, stream: null}];
                }
                return prev;
            });

            // Обрабатываем входящие треки
            pc.ontrack = (event) => {
                log(`Получен трек от ${peerId}`);

                setRemoteVideos(prev => {
                    return prev.map(p => {
                        if (p.id === peerId) {
                            return {...p, stream: event.streams[0]};
                        }
                        return p;
                    });
                });
            };

            // Ограничиваем количество отправляемых ICE кандидатов
            let iceCandidateCount = 0;
            const MAX_ICE_CANDIDATES = 5; // Отправляем только первые 5 кандидатов

            // Отправляем ICE кандидатов
            pc.onicecandidate = (event) => {
                if (event.candidate && iceCandidateCount < MAX_ICE_CANDIDATES) {
                    iceCandidateCount++;
                    log(`Отправка ICE кандидата ${iceCandidateCount} для ${peerId}`);

                    // Отправляем только хост и srflx кандидаты, пропускаем relay
                    const candidateType = event.candidate.candidate.split(' ')[7]; // Получаем тип кандидата
                    if (candidateType === 'host' || candidateType === 'srflx') {
                        safeSend({
                            type: 'ice-candidate',
                            to: peerId,
                            data: {
                                candidate: event.candidate.candidate,
                                sdpMid: event.candidate.sdpMid,
                                sdpMLineIndex: event.candidate.sdpMLineIndex
                            }
                        });
                    }
                }
            };

            pc.oniceconnectionstatechange = () => {
                log(`ICE состояние для ${peerId}: ${pc.iceConnectionState}`);

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
                log(`Создаем оффер для ${peerId}`);

                // Упрощенный оффер с ограничениями
                const offerOptions = {
                    offerToReceiveAudio: true,
                    offerToReceiveVideo: true,
                    voiceActivityDetection: false,
                    iceRestart: false
                };

                pc.createOffer(offerOptions)
                    .then(offer => {
                        // Упрощаем SDP для уменьшения размера
                        let sdp = offer.sdp;

                        // Удаляем ненужные кодеки и опции для уменьшения размера SDP
                        sdp = sdp.replace(/a=rtpmap:(?!96|97|98|99|100|101|102|103|104|105|106|107|108|109|110|111|112|113|114|115|116|117|118|119|120|121|122|123|124|125|126|127)\d+ .*\r\n/g, '');
                        sdp = sdp.replace(/a=fmtp:(?!96|97|98|99|100|101|102|103|104|105|106|107|108|109|110|111|112|113|114|115|116|117|118|119|120|121|122|123|124|125|126|127)\d+ .*\r\n/g, '');

                        const simplifiedOffer = new RTCSessionDescription({
                            type: 'offer',
                            sdp: sdp
                        });

                        log(`Установка локального описания для ${peerId}`);
                        return pc.setLocalDescription(simplifiedOffer);
                    })
                    .then(() => {
                        log(`Отправка оффера для ${peerId}`);

                        safeSend({
                            type: 'offer',
                            to: peerId,
                            data: {sdp: pc.localDescription.sdp}
                        });
                    })
                    .catch(err => log('Ошибка при создании оффера', err.message));
            }

            return pc;
        } catch (err) {
            log(`Ошибка при создании соединения с ${peerId}`, err.message);
            return null;
        }
    };

    // Обработка входящего оффера
    const handleOffer = async (message) => {
        const peerId = message.from;
        log(`Получен оффер от ${peerId}`);

        try {
            // Создаем соединение, если его еще нет
            let pc = peerConnectionsRef.current[peerId];
            if (!pc) {
                pc = createPeerConnection(peerId, false);
                if (!pc) return; // Если не удалось создать соединение
            }

            log(`Установка удаленного описания от ${peerId}`);
            await pc.setRemoteDescription(new RTCSessionDescription({
                type: 'offer',
                sdp: message.data.sdp
            }));

            log(`Создание ответа для ${peerId}`);
            const answer = await pc.createAnswer({
                voiceActivityDetection: false
            });

            // Упрощаем SDP для уменьшения размера
            let sdp = answer.sdp;
            sdp = sdp.replace(/a=rtpmap:(?!96|97|98|99|100|101|102|103|104|105|106|107|108|109|110|111|112|113|114|115|116|117|118|119|120|121|122|123|124|125|126|127)\d+ .*\r\n/g, '');
            sdp = sdp.replace(/a=fmtp:(?!96|97|98|99|100|101|102|103|104|105|106|107|108|109|110|111|112|113|114|115|116|117|118|119|120|121|122|123|124|125|126|127)\d+ .*\r\n/g, '');

            const simplifiedAnswer = new RTCSessionDescription({
                type: 'answer',
                sdp: sdp
            });

            log(`Установка локального описания для ${peerId}`);
            await pc.setLocalDescription(simplifiedAnswer);

            log(`Отправка ответа для ${peerId}`);
            safeSend({
                type: 'answer',
                to: peerId,
                data: {sdp: pc.localDescription.sdp}
            });
        } catch (err) {
            log('Ошибка при обработке оффера', err.message);
        }
    };

    // Обработка входящего ответа
    const handleAnswer = async (message) => {
        const peerId = message.from;
        log(`Получен ответ от ${peerId}`);

        const pc = peerConnectionsRef.current[peerId];
        if (pc) {
            try {
                log(`Установка удаленного описания от ${peerId}`);
                await pc.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: message.data.sdp
                }));
            } catch (err) {
                log('Ошибка при обработке ответа', err.message);
            }
        } else {
            log(`Нет соединения для ${peerId}`);
        }
    };
// Обработка ICE кандидатов
    const handleIceCandidate = async (message) => {
        const peerId = message.from;
        log(`Получен ICE кандидат от ${peerId}`);

        const pc = peerConnectionsRef.current[peerId];
        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate({
                    candidate: message.data.candidate,
                    sdpMid: message.data.sdpMid,
                    sdpMLineIndex: message.data.sdpMLineIndex
                }));
            } catch (err) {
                log('Ошибка при добавлении ICE кандидата', err.message);
            }
        } else {
            log(`Нет соединения для ${peerId}`);
        }
    };

// Очистка соединений
    const cleanupConnections = () => {
        log('Очистка соединений');

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

                <div style={{marginTop: '20px'}}>
                    <h3>Журнал событий</h3>
                    <pre
                        style={{
                            height: '200px',
                            overflow: 'auto',
                            backgroundColor: '#f5f5f5',
                            padding: '10px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            whiteSpace: 'pre-wrap'
                        }}
                    >
            {connectionStatus}
          </pre>
                </div>
            </div>
        </div>
    );
};

export default VideoCall;
