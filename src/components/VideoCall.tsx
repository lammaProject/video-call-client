// @ts-nocheck

import {useState, useEffect, useRef} from 'react';
import './VideoCall.css';

const VideoCall = () => {
    const [socketUrl, setSocketUrl] = useState('wss://video-chat-server-production.up.railway.app/ws');
    const [userId, setUserId] = useState(`user_${Math.floor(Math.random() * 1000000)}`);
    const [isConnected, setIsConnected] = useState(false);
    const [users, setUsers] = useState([]);
    const [selectedUser, setSelectedUser] = useState(null);
    const [callStatus, setCallStatus] = useState('idle'); // idle, calling, connected

    const socketRef = useRef<WebSocket>(null);
    const peerConnectionRef = useRef(null);
    const localStreamRef = useRef<MediaStream>(null);
    const localVideoRef = useRef(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);

    const initializePeerConnection = () => {
        const configuration = {
            iceServers: [
                {urls: 'stun:stun.l.google.com:19302'},
                {urls: 'stun:stun1.l.google.com:19302'},
            ]
        };

        const pc = new RTCPeerConnection(configuration);
        peerConnectionRef.current = pc;

        // Добавление локальных треков в соединение
        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => {
                pc.addTrack(track, localStreamRef.current);
            });
        }

        // Обработка входящих треков
        pc.ontrack = (event) => {
            console.log('Получен удаленный трек', event);
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = event.streams[0];
            }
        };

        // Обработка ICE кандидатов
        pc.onicecandidate = (event) => {
            if (event.candidate && socketRef.current && selectedUser) {
                const message = {
                    type: 'ice-candidate',
                    to: selectedUser,
                    data: {
                        candidate: event.candidate.candidate,
                        sdpMid: event.candidate.sdpMid,
                        sdpMLineIndex: event.candidate.sdpMLineIndex
                    }
                };
                socketRef.current.send(JSON.stringify(message));
            }
        };

        // Мониторинг состояния соединения
        pc.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', pc.iceConnectionState);
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                setCallStatus('connected');
            } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
                setCallStatus('idle');
            }
        };

        return pc;
    };

    // Подключение к WebSocket серверу
    const connectToServer = async () => {
        try {
            // Получение доступа к камере и микрофону
            const stream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            localStreamRef.current = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }

            // Подключение к WebSocket
            const socket = new WebSocket(`${socketUrl}?id=${userId}`);
            socketRef.current = socket;

            socket.onopen = () => {
                console.log('WebSocket соединение установлено');
                setIsConnected(true);
            };

            socket.onmessage = async (event) => {
                const message = JSON.parse(event.data);
                console.log('Получено сообщение:', message);

                // Обработка различных типов сообщений
                switch (message.type) {
                    case 'user-list':
                        // Обновление списка пользователей
                        if (message.data && message.data.users) {
                            // Фильтруем себя из списка
                            const otherUsers = message.data.users.filter(user => user !== userId);
                            setUsers(otherUsers);
                        }
                        break;

                    case 'offer':
                        // Обработка входящего предложения звонка
                        if (!peerConnectionRef.current) {
                            peerConnectionRef.current = initializePeerConnection();
                        }

                        setSelectedUser(message.from);
                        setCallStatus('calling');

                        try {
                            await peerConnectionRef.current.setRemoteDescription(
                                new RTCSessionDescription({type: 'offer', sdp: message.data.sdp})
                            );

                            const answer = await peerConnectionRef.current.createAnswer();
                            await peerConnectionRef.current.setLocalDescription(answer);

                            const answerMessage = {
                                type: 'answer',
                                to: message.from,
                                data: {
                                    sdp: peerConnectionRef.current.localDescription.sdp
                                }
                            };
                            socket.send(JSON.stringify(answerMessage));
                        } catch (err) {
                            console.error('Ошибка при обработке предложения:', err);
                        }
                        break;

                    case 'answer':
                        // Обработка ответа на звонок
                        if (peerConnectionRef.current) {
                            try {
                                await peerConnectionRef.current.setRemoteDescription(
                                    new RTCSessionDescription({type: 'answer', sdp: message.data.sdp})
                                );
                            } catch (err) {
                                console.error('Ошибка при обработке ответа:', err);
                            }
                        }
                        break;

                    case 'ice-candidate':
                        // Добавление ICE кандидата
                        if (peerConnectionRef.current) {
                            try {
                                await peerConnectionRef.current.addIceCandidate(
                                    new RTCIceCandidate({
                                        candidate: message.data.candidate,
                                        sdpMid: message.data.sdpMid,
                                        sdpMLineIndex: message.data.sdpMLineIndex
                                    })
                                );
                            } catch (err) {
                                console.error('Ошибка при добавлении ICE кандидата:', err);
                            }
                        }
                        break;
                }
            };

            socket.onerror = (error) => {
                console.error('WebSocket ошибка:', error);
            };

            socket.onclose = () => {
                console.log('WebSocket соединение закрыто');
                setIsConnected(false);
                setUsers([]);
                setCallStatus('idle');
                cleanupConnection();
            };
        } catch (err) {
            console.error('Ошибка при подключении:', err);
        }
    };

    // Инициирование звонка
    const startCall = async (targetUserId) => {
        if (!socketRef.current || !isConnected) {
            alert('Сначала подключитесь к серверу');
            return;
        }

        setSelectedUser(targetUserId);
        setCallStatus('calling');

        // Создание нового RTCPeerConnection
        const pc = initializePeerConnection();

        try {
            // Создание предложения
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            // Отправка предложения выбранному пользователю
            const offerMessage = {
                type: 'offer',
                to: targetUserId,
                data: {
                    sdp: pc.localDescription.sdp
                }
            };
            socketRef.current.send(JSON.stringify(offerMessage));
        } catch (err) {
            console.error('Ошибка при создании предложения:', err);
            setCallStatus('idle');
        }
    };

    // Завершение звонка
    const endCall = () => {
        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        setCallStatus('idle');
        setSelectedUser(null);

        // Если есть удаленное видео, очищаем его
        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
    };

    // Очистка ресурсов при размонтировании компонента
    const cleanupConnection = () => {
        if (socketRef.current) {
            socketRef.current.close();
            socketRef.current = null;
        }

        if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
        }

        if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(track => track.stop());
            localStreamRef.current = null;
        }

        if (localVideoRef.current) {
            localVideoRef.current.srcObject = null;
        }

        if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null;
        }
    };

    // Очистка ресурсов при размонтировании компонента
    useEffect(() => {
        return () => {
            cleanupConnection();
        };
    }, []);

    return (
        <div className="video-call-container">
            <div className="connection-controls">
                <h2>Видеозвонок</h2>
                <div className="connection-form">
                    <input
                        type="text"
                        value={socketUrl}
                        onChange={(e) => setSocketUrl(e.target.value)}
                        placeholder="WebSocket URL"
                        disabled={isConnected}
                    />
                    <input
                        type="text"
                        value={userId}
                        onChange={(e) => setUserId(e.target.value)}
                        placeholder="Ваш ID"
                        disabled={isConnected}
                    />
                    {!isConnected ? (
                        <button onClick={connectToServer}>Подключиться</button>
                    ) : (
                        <button onClick={() => {
                            cleanupConnection();
                            setIsConnected(false);
                        }}>Отключиться</button>
                    )}
                </div>
            </div>

            {isConnected && (
                <div className="video-call-interface">
                    <div className="video-container">
                        <div className="video-wrapper">
                            <video ref={localVideoRef} autoPlay muted playsInline className="local-video"/>
                            <div className="video-label">Вы ({userId})</div>
                        </div>
                        <div className="video-wrapper">
                            <video ref={remoteVideoRef} autoPlay playsInline className="remote-video"/>
                            <div className="video-label">
                                {callStatus === 'connected' ? selectedUser : 'Ожидание соединения...'}
                            </div>
                        </div>
                    </div>

                    <div className="users-list">
                        <h3>Доступные пользователи</h3>
                        {users.length === 0 ? (
                            <p>Нет доступных пользователей</p>
                        ) : (
                            <ul>
                                {users.map((user) => (
                                    <li key={user}>
                                        {user}
                                        {callStatus === 'idle' ? (
                                            <button onClick={() => startCall(user)}>Позвонить</button>
                                        ) : user === selectedUser ? (
                                            <button onClick={endCall}>Завершить</button>
                                        ) : null}
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
