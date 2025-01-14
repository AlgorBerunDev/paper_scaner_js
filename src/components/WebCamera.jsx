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

    // Enhanced grayscale conversion with contrast boost
    const grayscale = new Uint8Array(width * height);
    let min = 255,
      max = 0;

    for (let i = 0; i < data.length; i += 4) {
      const value = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      grayscale[i / 4] = value;
      min = Math.min(min, value);
      max = Math.max(max, value);
    }

    // Contrast enhancement
    const range = max - min;
    for (let i = 0; i < grayscale.length; i++) {
      grayscale[i] = ((grayscale[i] - min) / range) * 255;
    }

    // Advanced edge detection with noise reduction
    const edges = new Uint8Array(width * height);
    const blurred = new Uint8Array(width * height);

    // Gaussian blur for noise reduction
    const gaussKernel = [1, 2, 1, 2, 4, 2, 1, 2, 1];
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = (y + ky) * width + (x + kx);
            sum += grayscale[idx] * gaussKernel[(ky + 1) * 3 + (kx + 1)];
          }
        }
        blurred[y * width + x] = sum / 16;
      }
    }

    // Adaptive threshold for edge detection
    const calculateThreshold = (x, y) => {
      let sum = 0,
        count = 0;
      const windowSize = 5;
      for (let ky = -windowSize; ky <= windowSize; ky++) {
        for (let kx = -windowSize; kx <= windowSize; kx++) {
          const ny = y + ky;
          const nx = x + kx;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            sum += blurred[ny * width + nx];
            count++;
          }
        }
      }
      return (sum / count) * 0.8; // 80% of local average
    };

    // Enhanced Sobel operator with adaptive thresholding
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;

        // Sobel kernels
        const gx =
          -blurred[idx - width - 1] +
          -2 * blurred[idx - 1] +
          -blurred[idx + width - 1] +
          blurred[idx - width + 1] +
          2 * blurred[idx + 1] +
          blurred[idx + width + 1];

        const gy =
          -blurred[idx - width - 1] +
          -2 * blurred[idx - width] +
          -blurred[idx - width + 1] +
          blurred[idx + width - 1] +
          2 * blurred[idx + width] +
          blurred[idx + width + 1];

        const g = Math.sqrt(gx * gx + gy * gy);
        const threshold = calculateThreshold(x, y);
        edges[idx] = g > threshold ? 255 : 0;
      }
    }

    // Line detection with A4 aspect ratio consideration
    const lines = {
      horizontal: [],
      vertical: [],
    };

    // A4 proportions (1:√2)
    const A4_RATIO = 1.4142;
    const RATIO_TOLERANCE = 0.2;

    // Find strong lines
    const minLineLength = Math.min(width, height) * 0.2; // At least 20% of smaller dimension

    // Horizontal lines
    for (let y = 0; y < height; y++) {
      let lineStart = -1;
      let lineStrength = 0;
      let edgePoints = [];

      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (edges[idx] > 0) {
          if (lineStart === -1) lineStart = x;
          lineStrength++;
          edgePoints.push(x);
        } else if (lineStart !== -1) {
          if (lineStrength >= minLineLength) {
            // Calculate line quality (continuity)
            const gaps = edgePoints.slice(1).map((x, i) => x - edgePoints[i] - 1);
            const maxGap = Math.max(...gaps, 0);
            if (maxGap < 20) {
              // Allow small gaps
              lines.horizontal.push({
                y,
                x1: lineStart,
                x2: lineStart + lineStrength,
                strength: lineStrength,
                quality: 1 - maxGap / lineStrength,
              });
            }
          }
          lineStart = -1;
          lineStrength = 0;
          edgePoints = [];
        }
      }
    }

    // Vertical lines (similar to horizontal)
    for (let x = 0; x < width; x++) {
      let lineStart = -1;
      let lineStrength = 0;
      let edgePoints = [];

      for (let y = 0; y < height; y++) {
        const idx = y * width + x;
        if (edges[idx] > 0) {
          if (lineStart === -1) lineStart = y;
          lineStrength++;
          edgePoints.push(y);
        } else if (lineStart !== -1) {
          if (lineStrength >= minLineLength) {
            const gaps = edgePoints.slice(1).map((y, i) => y - edgePoints[i] - 1);
            const maxGap = Math.max(...gaps, 0);
            if (maxGap < 20) {
              lines.vertical.push({
                x,
                y1: lineStart,
                y2: lineStart + lineStrength,
                strength: lineStrength,
                quality: 1 - maxGap / lineStrength,
              });
            }
          }
          lineStart = -1;
          lineStrength = 0;
          edgePoints = [];
        }
      }
    }

    // Sort lines by quality and strength
    lines.horizontal.sort((a, b) => b.quality * b.strength - a.quality * a.strength);
    lines.vertical.sort((a, b) => b.quality * b.strength - a.quality * a.strength);

    // Take best candidates
    lines.horizontal = lines.horizontal.slice(0, 10);
    lines.vertical = lines.vertical.slice(0, 10);

    // Find paper corners by checking line intersections and A4 proportions
    const findCorners = () => {
      let bestCorners = null;
      let bestScore = 0;

      for (const h1 of lines.horizontal) {
        for (const h2 of lines.horizontal) {
          if (h1 === h2) continue;

          const height = Math.abs(h1.y - h2.y);
          if (height < minLineLength) continue;

          for (const v1 of lines.vertical) {
            for (const v2 of lines.vertical) {
              if (v1 === v2) continue;

              const width = Math.abs(v1.x - v2.x);
              if (width < minLineLength) continue;

              const ratio = height / width;
              if (Math.abs(ratio - A4_RATIO) > RATIO_TOLERANCE) continue;

              const corners = [
                { x: v1.x, y: h1.y },
                { x: v2.x, y: h1.y },
                { x: v1.x, y: h2.y },
                { x: v2.x, y: h2.y },
              ];

              const score =
                (h1.quality + h2.quality + v1.quality + v2.quality) *
                (1 - Math.abs(ratio - A4_RATIO) / RATIO_TOLERANCE);

              if (score > bestScore) {
                bestScore = score;
                bestCorners = corners;
              }
            }
          }
        }
      }

      return bestCorners;
    };

    const corners = findCorners();

    // Draw detected paper
    if (corners) {
      ctx.strokeStyle = "#00FF00";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      ctx.lineTo(corners[1].x, corners[1].y);
      ctx.lineTo(corners[3].x, corners[3].y);
      ctx.lineTo(corners[2].x, corners[2].y);
      ctx.closePath();
      ctx.stroke();

      // Draw corners
      ctx.fillStyle = "#FF0000";
      corners.forEach(corner => {
        ctx.beginPath();
        ctx.arc(corner.x, corner.y, 5, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  };

  const drawToCanvas = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const context = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    context.drawImage(video, 0, 0);
    findPaper(context, canvas.width, canvas.height);

    requestId.current = requestAnimationFrame(drawToCanvas);
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: "environment",
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
      <canvas ref={canvasRef} className="w-full max-w-4xl border border-gray-300 rounded-lg" />
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
