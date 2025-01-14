import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

const WebCamera = () => {
  const videoRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isStarted, setIsStarted] = useState(false);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        setIsStarted(true);
        setError(null);
      }
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Ошибка доступа к камере");
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setStream(null);
      setIsStarted(false);
    }
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="flex flex-col items-center space-y-4 p-4">
      <div className="relative w-full max-w-2xl bg-black">
        {error && <div className="text-red-500 mb-2">{error}</div>}
        <video ref={videoRef} autoPlay playsInline className={`w-full ${isStarted ? "block" : "hidden"}`} />
      </div>

      <div className="flex space-x-4">
        <button
          onClick={isStarted ? stopCamera : startCamera}
          className={`flex items-center px-4 py-2 rounded-lg ${
            isStarted ? "bg-red-500 hover:bg-red-600" : "bg-green-500 hover:bg-green-600"
          } text-white transition-colors`}
        >
          {isStarted ? (
            <>
              <CameraOff className="mr-2" size={20} />
              Остановить камеру
            </>
          ) : (
            <>
              <Camera className="mr-2" size={20} />
              Включить камеру
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default WebCamera;
