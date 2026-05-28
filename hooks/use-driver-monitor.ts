import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform, Vibration, useColorScheme } from 'react-native';
import { Camera, useCameraDevice, useCameraPermission } from 'react-native-vision-camera';
import FaceDetection, { type Face, type Frame, type Point } from '@react-native-ml-kit/face-detection';
import * as Location from 'expo-location';
import { Buffer } from 'buffer';
import { useAuth } from '@/context/auth';
import { useBleContext } from '@/context/ble-context';
import { EmergencyService } from '@/services/emergency-service';
import { SmsService } from '@/services/sms-service';
import { Colors } from '@/constants/color';

const DETECTION_INTERVAL_MS = 333;
const EYE_CLOSED_PROBABILITY = 0.3;
const SUSTAINED_CLOSURE_MS = 0;

export type DetectionOverlay = {
  imageWidth: number;
  imageHeight: number;
  isMirrored: boolean;
  face: Frame;
  leftEye: Frame;
  rightEye: Frame;
  leftEyePoints: Point[];
  rightEyePoints: Point[];
};

const getFrameFromPoints = (points: Point[]): Frame | null => {
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { 
    left: Math.min(...xs), 
    top: Math.min(...ys), 
    width: Math.max(...xs) - Math.min(...xs), 
    height: Math.max(...ys) - Math.min(...ys) 
  };
};

const getFallbackEyeFrame = (face: Frame, side: 'left' | 'right'): Frame => {
  const eyeWidth = face.width * 0.22;
  const eyeHeight = face.height * 0.12;
  const eyeTop = face.top + face.height * 0.34;
  const eyeLeft = side === 'left' ? face.left + face.width * 0.22 : face.left + face.width * 0.56;
  return { left: eyeLeft, top: eyeTop, width: eyeWidth, height: eyeHeight };
};

const getLargestFace = (faces: Face[]) => {
  return faces.reduce((largest, face) => {
    return face.frame.width * face.frame.height > largest.frame.width * largest.frame.height ? face : largest;
  }, faces[0]);
};

const getMlKitImageUrl = (path: string) => {
  return path.startsWith('file://') || path.startsWith('content://') || path.startsWith('http') ? path : `file://${path}`;
};

export function useDriverMonitor() {
  const theme = useColorScheme() ?? 'light';
  const colors = Colors[theme as 'light' | 'dark'];

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const cameraRef = useRef<Camera>(null);
  const { connectedDevice } = useBleContext();
  const { user } = useAuth();

  const [eyesClosed, setEyesClosed] = useState(false);
  const [isAlerting, setIsAlerting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [smsSent, setSmsSent] = useState(false);
  const [eyeOpenProbability, setEyeOpenProbability] = useState(1);
  const [faceDetected, setFaceDetected] = useState(false);

  const [isInfoHidden, setIsInfoHidden] = useState(false);
  const [cameraLayout, setCameraLayout] = useState({ width: 0, height: 0 });
  const [detectionOverlay, setDetectionOverlay] = useState<DetectionOverlay | null>(null);
  const [detectorStatus, setDetectorStatus] = useState('Starting eye detector...');
  
  const isAlertingRef = useRef(false);
  const isDetectingRef = useRef(false);
  const closedEyesStartedAtRef = useRef<number | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runDetection = useCallback(async () => {
    if (isAlertingRef.current || isDetectingRef.current || !cameraRef.current) return;

    isDetectingRef.current = true;
    try {
      setDetectorStatus('Scanning for face...');
      const photo = await cameraRef.current.takeSnapshot({ quality: 50 });
      const faces = await FaceDetection.detect(getMlKitImageUrl(photo.path), {
        performanceMode: 'fast',
        landmarkMode: 'none',
        contourMode: 'all',
        classificationMode: 'all',
        minFaceSize: 0.15,
      });

      if (faces.length > 0) {
        const face = getLargestFace(faces);
        const leftOpen = face.leftEyeOpenProbability ?? 1.0;
        const rightOpen = face.rightEyeOpenProbability ?? 1.0;
        const averageEyeOpenProbability = (leftOpen + rightOpen) / 2;
        const eyesAreCurrentlyClosed = averageEyeOpenProbability < EYE_CLOSED_PROBABILITY;
        const now = Date.now();
        const leftEyePoints = face.contours?.leftEye?.points ?? [];
        const rightEyePoints = face.contours?.rightEye?.points ?? [];
        const leftEye = getFrameFromPoints(leftEyePoints) ?? getFallbackEyeFrame(face.frame, 'left');
        const rightEye = getFrameFromPoints(rightEyePoints) ?? getFallbackEyeFrame(face.frame, 'right');

        setFaceDetected(true);
        setDetectorStatus('Eyes detected');
        setEyeOpenProbability(averageEyeOpenProbability);
        setDetectionOverlay({
          imageWidth: photo.width,
          imageHeight: photo.height,
          isMirrored: photo.isMirrored,
          face: face.frame,
          leftEye,
          rightEye,
          leftEyePoints,
          rightEyePoints,
        });

        if (eyesAreCurrentlyClosed) {
          closedEyesStartedAtRef.current ??= now;
          const closedDuration = now - closedEyesStartedAtRef.current;
          setEyesClosed(closedDuration >= SUSTAINED_CLOSURE_MS);
        } else {
          closedEyesStartedAtRef.current = null;
          setEyesClosed(false);
        }
      } else {
        setFaceDetected(false);
        setDetectorStatus('No face detected');
        setEyeOpenProbability(0);
        setDetectionOverlay(null);
        closedEyesStartedAtRef.current = null;
        setEyesClosed(false);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Detector unavailable';
      setDetectorStatus(message);
      setFaceDetected(false);
      setDetectionOverlay(null);
      closedEyesStartedAtRef.current = null;
      setEyesClosed(false);
    } finally {
      isDetectingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (hasPermission && device) {
      detectionIntervalRef.current = setInterval(runDetection, DETECTION_INTERVAL_MS);
    }
    return () => {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    };
  }, [hasPermission, device, runDetection]);

  // eyes closed
  useEffect(() => {
    if (eyesClosed && !isAlertingRef.current) {
      const triggerAlert = async () => {
        if (isAlertingRef.current) return;
        isAlertingRef.current = true;
        setIsAlerting(true);
        setShowModal(true);
        setCountdown(10);
        setSmsSent(false);

        // phone vibration
        if (Platform.OS !== 'web') {
          Vibration.vibrate([300, 200, 300, 200, 300, 200], true);
        }

        // send ble vibrate
        if (connectedDevice) {
          try {
            await connectedDevice.writeCharacteristicWithResponseForService(
              '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
              'beb5483e-36e1-4688-b7f5-ea07361b26a8',
              Buffer.from('VIBRATE').toString('base64')
            );
          } catch (e) {
            console.warn('BLE VIBRATE command failed:', e);
          }
        }
      };

      triggerAlert();
    }
  }, [eyesClosed, connectedDevice]);

  const sendEmergencySms = useCallback(async () => {
    const contacts = await EmergencyService.getContacts();
    const activeContact = contacts.find(c => c.isSelected !== false) || contacts[0];
    const emergencyPhone = activeContact?.phoneNumber;
    if (!emergencyPhone) {
      console.warn('No emergency contact configured.');
      return;
    }

    let locationUrl = '';
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        locationUrl = `https://maps.google.com/?q=${loc.coords.latitude},${loc.coords.longitude}`;
      }
    } catch (e) {
      console.warn('Could not get location for SMS:', e);
    }

    const driverName = user?.name || user?.displayName || 'Driver';
    const message = `ALERTO DROWSINESS ALERT! ${driverName} has been detected as drowsy while driving. Immediate attention may be required.${locationUrl ? `\n\nLast known location: ${locationUrl}` : ''}`;

    const result = await SmsService.sendSms(emergencyPhone, message);
    if (result.success) {
      console.log('Emergency SMS sent successfully:', result.messageId);
    } else {
      console.error('SMS failed:', result.error);
    }
  }, [user]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (showModal && !smsSent && countdown > 0) {
      interval = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);
    } else if (countdown === 0 && !smsSent) {
      setSmsSent(true);
      sendEmergencySms();
    }
    return () => clearInterval(interval);
  }, [showModal, smsSent, countdown, sendEmergencySms]);

  useEffect(() => {
    return () => {
      Vibration.cancel();
      isAlertingRef.current = false;
    };
  }, []);

  const getStatusText = () => {
    if (isAlerting) return 'DROWSINESS DETECTED!';
    if (eyesClosed) return 'Eyes Closed...';
    if (eyesClosed) return 'Blink / Eye Closure Detected';
    if (!faceDetected) return 'Eye Detector Scanning';
    return 'Driver Active & Safe';
  };

  const getStatusColor = () => {
    if (isAlerting) return colors.locationMarker;
    if (eyesClosed) return colors.warningIcon;
    return colors.lightning;
  };

  const handleDismissAlert = () => {
    setShowModal(false);
    setIsAlerting(false);
    isAlertingRef.current = false;
    setEyesClosed(false);
    setSmsSent(false);
    setEyeOpenProbability(1.0);
    closedEyesStartedAtRef.current = null;
    Vibration.cancel();

    if (connectedDevice) {
      connectedDevice.writeCharacteristicWithResponseForService(
        '4fafc201-1fb5-459e-8fcc-c5c9c331914b',
        'beb5483e-36e1-4688-b7f5-ea07361b26a8',
        Buffer.from('STOP').toString('base64')
      ).catch((e: any) => console.warn('BLE STOP error:', e));
    }
  };

  const mapCameraFrameToPreview = (frame: Frame) => {
    if (!detectionOverlay || cameraLayout.width === 0 || cameraLayout.height === 0) return null;

    const scale = Math.max(
      cameraLayout.width / detectionOverlay.imageWidth,
      cameraLayout.height / detectionOverlay.imageHeight
    );
    const offsetX = (cameraLayout.width - detectionOverlay.imageWidth * scale) / 2;
    const offsetY = (cameraLayout.height - detectionOverlay.imageHeight * scale) / 2;
    const left = detectionOverlay.isMirrored
      ? detectionOverlay.imageWidth - frame.left - frame.width
      : frame.left;

    return {
      left: offsetX + left * scale,
      top: offsetY + frame.top * scale,
      width: frame.width * scale,
      height: frame.height * scale,
    };
  };

  const mapCameraPointToPreview = (point: Point) => {
    if (!detectionOverlay || cameraLayout.width === 0 || cameraLayout.height === 0) return null;

    const scale = Math.max(
      cameraLayout.width / detectionOverlay.imageWidth,
      cameraLayout.height / detectionOverlay.imageHeight
    );
    const offsetX = (cameraLayout.width - detectionOverlay.imageWidth * scale) / 2;
    const offsetY = (cameraLayout.height - detectionOverlay.imageHeight * scale) / 2;
    const x = detectionOverlay.isMirrored ? detectionOverlay.imageWidth - point.x : point.x;

    return {
      left: offsetX + x * scale,
      top: offsetY + point.y * scale,
    };
  };

  const eyeOpenPercent = Math.round(eyeOpenProbability * 100);

  return {
    hasPermission,
    requestPermission,
    device,
    cameraRef,
    eyesClosed,
    isAlerting,
    showModal,
    countdown,
    smsSent,
    eyeOpenPercent,
    faceDetected,
    isInfoHidden,
    setIsInfoHidden,
    cameraLayout,
    setCameraLayout,
    detectionOverlay,
    detectorStatus,
    handleDismissAlert,
    connectedDevice,
    getStatusText,
    getStatusColor,
    mapCameraFrameToPreview,
    mapCameraPointToPreview,
  };
}
