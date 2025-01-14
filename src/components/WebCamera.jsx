import React, { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

const WebCamera = () => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isStarted, setIsStarted] = useState(false);
  const requestId = useRef(null);

  const findPaper = (ctx, width, height) => {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Convert to grayscale and detect edges
    const grayscale = new Uint8Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
      grayscale[i / 4] = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }

    // Simple edge detection
    const edges = new Uint8Array(width * height);
    const threshold = 30;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Sobel operator
        const gx =
          grayscale[idx - width - 1] +
          2 * grayscale[idx - 1] +
          grayscale[idx + width - 1] -
          grayscale[idx - width + 1] -
          2 * grayscale[idx + 1] -
          grayscale[idx + width + 1];

        const gy =
          grayscale[idx - width - 1] +
          2 * grayscale[idx - width] +
          grayscale[idx - width + 1] -
          grayscale[idx + width - 1] -
          2 * grayscale[idx + width] -
          grayscale[idx + width + 1];

        const g = Math.sqrt(gx * gx + gy * gy);
        edges[idx] = g > threshold ? 255 : 0;
      }
    }

    // Find long straight lines (potential paper edges)
    const lines = [];
    const minLineLength = width * 0.3; // At least 30% of image width

    // Horizontal lines
    for (let y = 0; y < height; y++) {
      let lineStart = -1;
      let lineLength = 0;

      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (edges[idx] > 0) {
          if (lineStart === -1) lineStart = x;
          lineLength++;
        } else if (lineStart !== -1) {
          if (lineLength >= minLineLength) {
            lines.push({
              start: { x: lineStart, y },
              end: { x: lineStart + lineLength, y },
              length: lineLength,
              isHorizontal: true,
            });
          }
          lineStart = -1;
          lineLength = 0;
        }
      }
    }

    // Vertical lines
    for (let x = 0; x < width; x++) {
      let lineStart = -1;
      let lineLength = 0;

      for (let y = 0; y < height; y++) {
        const idx = y * width + x;
        if (edges[idx] > 0) {
          if (lineStart === -1) lineStart = y;
          lineLength++;
        } else if (lineStart !== -1) {
          if (lineLength >= minLineLength) {
            lines.push({
              start: { x, y: lineStart },
              end: { x, y: lineStart + lineLength },
              length: lineLength,
              isHorizontal: false,
            });
          }
          lineStart = -1;
          lineLength = 0;
        }
      }
    }

    // Draw detected lines
    ctx.strokeStyle = "#00FF00";
    ctx.lineWidth = 3;
    lines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.lineTo(line.end.x, line.end.y);
      ctx.stroke();
    });

    // Try to find paper corners from line intersections
    const corners = [];
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const line1 = lines[i];
        const line2 = lines[j];

        // Only check intersections between horizontal and vertical lines
        if (line1.isHorizontal === line2.isHorizontal) continue;

        const horLine = line1.isHorizontal ? line1 : line2;
        const vertLine = line1.isHorizontal ? line2 : line1;

        if (
          vertLine.start.x >= horLine.start.x &&
          vertLine.start.x <= horLine.end.x &&
          horLine.start.y >= vertLine.start.y &&
          horLine.start.y <= vertLine.end.y
        ) {
          corners.push({
            x: vertLine.start.x,
            y: horLine.start.y,
          });
        }
      }
    }

    // Draw corners
    ctx.fillStyle = "#FF0000";
    corners.forEach(corner => {
      ctx.beginPath();
      ctx.arc(corner.x, corner.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });
  };

  const drawToCanvas = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw original frame
    context.drawImage(video, 0, 0);

    // Find and highlight paper
    findPaper(context, canvas.width, canvas.height);

    requestId.current = requestAnimationFrame(drawToCanvas);
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment", // Use back camera if available
        },
      });

      videoRef.current.srcObject = mediaStream;
      setStream(mediaStream);
      setIsStarted(true);

      videoRef.current.onloadedmetadata = () => {
        videoRef.current.play();
        drawToCanvas();
      };
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const stopCamera = () => {
    if (requestId.current) {
      cancelAnimationFrame(requestId.current);
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStream(null);
    setIsStarted(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4">
      <video ref={videoRef} className="hidden" playsInline />
      <canvas ref={canvasRef} className="w-full max-w-2xl border border-gray-300 rounded-lg" />
      <button
        onClick={isStarted ? stopCamera : startCamera}
        className={`px-4 py-2 rounded-lg flex items-center gap-2 text-white ${
          isStarted ? "bg-red-500" : "bg-green-500"
        }`}
      >
        {isStarted ? (
          <>
            <CameraOff size={20} />
            Остановить
          </>
        ) : (
          <>
            <Camera size={20} />
            Запустить
          </>
        )}
      </button>
    </div>
  );
};

export default WebCamera;
