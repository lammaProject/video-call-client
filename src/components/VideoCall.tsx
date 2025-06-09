// @ts-nocheck

import React, {useState, useRef, useEffect} from 'react';

const VideoCall = () => {
    const [connected, setConnected] = useState(false);
    const [userId] = useState(`user_${Math.floor(Math.random() * 10000)}`);
    const [users, setUsers] = useState([]);
    const [callPartner, setCallPartner] = useState(null);

    const socketRef = useRef(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef(null);

    const connectToServer = async () => {
        try {
            // Получаем доступ к камере и микрофону
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            localStreamRef.current = stream;

            // Проверяем, что ссылка на видео-элемент существует
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            } else {
                console.error('localVideoRef.current is null');
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

                // Обрабатываем список пользователей
                if (message.type === 'user-list' && message.data && message.data.users) {
                    const otherUsers = message.data.users.filter(user => user !== userId);
                    setUsers(otherUsers);
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
            };
        } catch (err) {
            console.error('Ошибка:', err);
        }
    };

    const createPeerConnection = () => {
        const pc = new RTCPeerConnection({
            iceServers: [{urls: 'stun:stun.l.google.com:19302'}]
        });

        // Добавляем локальные треки
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        // Обрабатываем входящие треки
        pc.ontrack = (event) => {
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            } else {
                console.error('remoteVideoRef.current is null');
            }
        };

        // Отправляем ICE кандидатов
        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current && callPartner) {
                socketRef.current.send(JSON.stringify({
                    type: 'ice-candidate',
                    to: callPartner,
                    data: {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex
                    }
                }));
            }
        };

        peerConnectionRef.current = pc;
        return pc;
    };

    const startCall = async (targetId) => {
        setCallPartner(targetId);
        const pc = createPeerConnection();

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            if (socketRef.current) {
                socketRef.current.send(JSON.stringify({
                    type: 'offer',
                    to: targetId,
                    data: {sdp: pc.localDescription.sdp}
                }));
            } else {
                console.error('socketRef.current is null');
            }
        } catch (err) {
            console.error('Ошибка при создании предложения:', err);
        }
    };

    const handleOffer = async (message) => {
        setCallPartner(message.from);
        const pc = createPeerConnection();

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
                    to: message.from,
                    data: {sdp: pc.localDescription.sdp}
                }));
            } else {
                console.error('socketRef.current is null');
            }
        } catch (err) {
            console.error('Ошибка при обработке предложения:', err);
        }
    };

    const handleAnswer = async (message) => {
        try {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription({
                    type: 'answer',
                    sdp: message.data.sdp
                }));
            } else {
                console.error('peerConnectionRef.current is null');
            }
        } catch (err) {
            console.error('Ошибка при обработке ответа:', err);
        }
    };

    const handleIceCandidate = async (message) => {
        try {
            if (peerConnectionRef.current) {
                await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate({
                    candidate: message.data.candidate,
                    sdpMid: message.data.sdpMid,
                    sdpMLineIndex: message.data.sdpMLineIndex
                }));
            } else {
                console.error('peerConnectionRef.current is null');
            }
        } catch (err) {
            console.error('Ошибка при добавлении ICE кандидата:', err);
        }
    };

    // Очистка ресурсов при размонтировании
    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }

            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
            }

            if (localStreamRef.current) {
                localStreamRef.current.getTracks().forEach(track => track.stop());
            }
        };
    }, []);

    return (
        <div style={{padding: '20px'}}>
            <h2>Простой видеочат</h2>
            <p>Ваш ID: {userId}</p>

            {!connected ? (
                <button onClick={connectToServer}>Подключиться</button>
            ) : (
                <div>
                    <p>Подключено к серверу</p>

                    <div style={{display: 'flex', gap: '20px', marginBottom: '20px'}}>
                        <div>
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
                            <h3>Собеседник</h3>
                            <video
                                ref={remoteVideoRef}
                                autoPlay
                                playsInline
                                style={{width: '320px', height: '240px', backgroundColor: '#000'}}
                            />
                        </div>
                    </div>

                    <div>
                        <h3>Доступные пользователи:</h3>
                        {users.length === 0 ? (
                            <p>Нет других пользователей</p>
                        ) : (
                            <ul>
                                {users.map(user => (
                                    <li key={user}>
                                        {user}
                                        <button onClick={() => startCall(user)}>
                                            Позвонить
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default VideoCall;
