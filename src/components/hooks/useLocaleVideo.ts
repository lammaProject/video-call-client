import { useEffect, useRef, useState } from "react";

interface Props {
  connection: boolean;
}

const useLocaleVideo = ({ connection }: Props) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream>(null);

  useEffect(() => {
    if (!connection) return;

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
        }
      } catch (error) {
        console.error("Error accessing media devices:", error);
      }
    };

    void getLocalVideo();

    return () => {
      mounted = false;
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          track.stop();
        });
      }
    };
  }, [connection]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  return {
    localStream,
    localVideoRef,
    localStreamRef,
  };
};

export { useLocaleVideo };
