import React from 'react';
import { View, StyleSheet } from 'react-native';

type CameraOverlayProps = {
  faceOverlayStyle: any;
  leftEyeOverlayStyle: any;
  rightEyeOverlayStyle: any;
  eyePoints: any[];
  mapCameraPointToPreview: (point: any) => any;
  statusColor: string;
  isLandscape: boolean;
};

export function CameraOverlay({
  faceOverlayStyle,
  leftEyeOverlayStyle,
  rightEyeOverlayStyle,
  eyePoints,
  mapCameraPointToPreview,
  statusColor,
  isLandscape,
}: CameraOverlayProps) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
      {!faceOverlayStyle && (
        <View style={[styles.scanningGuide, isLandscape && styles.scanningGuideLandscape]}>
          <View style={styles.scanCornerTopLeft} />
          <View style={styles.scanCornerTopRight} />
          <View style={styles.scanCornerBottomLeft} />
          <View style={styles.scanCornerBottomRight} />
        </View>
      )}
      {faceOverlayStyle && (
        <View style={[styles.faceGuide, { borderColor: statusColor }, faceOverlayStyle]} />
      )}
      {leftEyeOverlayStyle && (
        <View style={[styles.eyeGuide, { borderColor: statusColor }, leftEyeOverlayStyle]} />
      )}
      {rightEyeOverlayStyle && (
        <View style={[styles.eyeGuide, { borderColor: statusColor }, rightEyeOverlayStyle]} />
      )}
      {eyePoints.map((point, index) => {
        const pointStyle = mapCameraPointToPreview(point);
        if (!pointStyle) return null;

        return (
          <View
            key={`${point.x}-${point.y}-${index}`}
            style={[
              styles.landmarkDot,
              {
                backgroundColor: statusColor,
                left: pointStyle.left - 2,
                top: pointStyle.top - 2,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  faceGuide: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.05)',
    zIndex: 10,
    elevation: 10,
  },
  eyeGuide: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    zIndex: 11,
    elevation: 11,
  },
  landmarkDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    borderRadius: 2,
    zIndex: 12,
    elevation: 12,
  },
  scanningGuide: {
    position: 'absolute',
    width: 220,
    height: 260,
    top: '25%',
    alignSelf: 'center',
    zIndex: 9,
    elevation: 9,
  },
  scanningGuideLandscape: {
    width: 320,
    height: 190,
    top: '22%',
  },
  scanCornerTopLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 44,
    height: 44,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#4ade80',
    borderTopLeftRadius: 8,
  },
  scanCornerTopRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 44,
    height: 44,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderColor: '#4ade80',
    borderTopRightRadius: 8,
  },
  scanCornerBottomLeft: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    width: 44,
    height: 44,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderColor: '#4ade80',
    borderBottomLeftRadius: 8,
  },
  scanCornerBottomRight: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 44,
    height: 44,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderColor: '#4ade80',
    borderBottomRightRadius: 8,
  },
});
