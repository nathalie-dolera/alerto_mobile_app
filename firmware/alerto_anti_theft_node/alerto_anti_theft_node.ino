#pragma GCC optimize("O2")

#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <NimBLEDevice.h>
#include <Wire.h>
#include <math.h>

#define REED_PIN 5
#define LDR_PIN 4
#define MPU_SDA 8
#define MPU_SCL 9
#define MOTOR_PIN 1
#define BUZZER_PIN 2

// Reed Switch Logic:
// REED_CLOSED_STATE = Magnet Present (Zipper Closed = SAFE) -> HIGH
// REED_OPEN_STATE   = Magnet Removed (Zipper Opened = INTRUSION) -> LOW
#define REED_CLOSED_STATE HIGH
#define REED_OPEN_STATE   LOW

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define WRITE_CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define NOTIFY_CHARACTERISTIC_UUID "12345678-4321-4321-4321-123456789abc"

Adafruit_MPU6050 mpu;
bool mpuFunctional = false;

bool calibrated = false;
bool alarmActive = false;
bool systemArmed = false;
bool antiTheftMonitoringEnabled = false;
String currentStatus = "SAFE";
unsigned long calibrationStartMs = 0;
const unsigned long CALIBRATION_DURATION_MS = 3000;

int alertType = 0;
int baselineLDR = 0;
float baselineMotion = 0;

bool enableReed = true;
bool enableLdr = true;
bool enableMpu = true;
bool buzzerEnabled = true;
bool vibrationEnabled = true;

bool destinationAlarmEnabled = false;
float destinationLat = 0.0;
float destinationLng = 0.0;
bool destinationAlarmTriggered = false;
bool destinationAlarmCompleted = false;
bool destinationAlertActive = false;

int wakeShakeSec = 3;
float triggerDistanceKm = 1.0;
float destinationBaselineMotion = 0;

unsigned long lastPulseToggleMs = 0;
bool pulseState = false;
const unsigned long PULSE_ON_DURATION_MS = 400;
const unsigned long PULSE_OFF_DURATION_MS = 300;

unsigned long shakeStartTimeMs = 0;
unsigned long lastValidShakeTimeMs = 0;
bool isShaking = false;

const unsigned long SHAKE_DISMISS_DURATION_MS = 3000;
const unsigned long SHAKE_GAP_ALLOWED_MS = 1500;
const float MOTION_SNATCH_THRESHOLD = 1.8;
// SHAKE_DISMISS_THRESHOLD: raised to 5.0 to require vigorous hand shaking.
// Normal walking produces ~1.5-2.5 (low gyro, small accel delta).
// Intentional shaking produces >5.0 (high gyro + sharp accel spikes).
const float SHAKE_DISMISS_THRESHOLD = 5.0;

bool deviceConnected = false;
NimBLECharacteristic *pNotifyChar = nullptr;

float readCombinedMotion() {
  if (!mpuFunctional)
    return 9.8;
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);

  float accelMag = sqrt(a.acceleration.x * a.acceleration.x +
                        a.acceleration.y * a.acceleration.y +
                        a.acceleration.z * a.acceleration.z);

  float gyroMag =
      sqrt(g.gyro.x * g.gyro.x + g.gyro.y * g.gyro.y + g.gyro.z * g.gyro.z);

  // Combine acceleration deviation from gravity (9.81) + rotational motion
  return abs(accelMag - 9.81f) + (gyroMag * 1.5f);
}

float readMotionMagnitude() { return readCombinedMotion(); }

void resetShakeState() {
  isShaking = false;
  shakeStartTimeMs = 0;
  lastValidShakeTimeMs = 0;
}

void stopOutputs() {
  digitalWrite(MOTOR_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  pulseState = false;
}

void clearAntiTheftAlarm(const char *status) {
  alarmActive = false;
  alertType = 0;
  currentStatus = status;
  resetShakeState();
  stopOutputs();
}

void startCalibrationPhase() {
  calibrated = false;
  calibrationStartMs = millis();
  currentStatus = "calibrating";
  alarmActive = false;
  alertType = 0;
  resetShakeState();
  stopOutputs();
}

void configureDestinationAlarm(String payload) {
  int idx1 = payload.indexOf(',');
  int idx2 = payload.indexOf(',', idx1 + 1);
  int idx3 = payload.indexOf(',', idx2 + 1);

  if (idx1 == -1 || idx2 == -1 || idx3 == -1)
    return;

  destinationLat = payload.substring(0, idx1).toFloat();
  destinationLng = payload.substring(idx1 + 1, idx2).toFloat();
  wakeShakeSec = payload.substring(idx2 + 1, idx3).toInt();
  triggerDistanceKm = payload.substring(idx3 + 1).toFloat();
  destinationAlarmEnabled = true;
  destinationAlarmTriggered = false;
  destinationAlarmCompleted = false;
  destinationAlertActive = false;
  currentStatus = "DESTINATION_SET";
  resetShakeState();
  stopOutputs();
  Serial.printf("[DESTINATION] Configured. Shake=%ds Trigger=%.2fkm\n",
                wakeShakeSec, triggerDistanceKm);
}

void startDestinationAlert() {
  if (!destinationAlarmEnabled) {
    destinationAlarmEnabled = true;
  }

  destinationAlarmTriggered = true;
  destinationAlarmCompleted = false;
  destinationAlertActive = true;
  currentStatus = "DESTINATION_REACHED";
  destinationBaselineMotion = readMotionMagnitude();
  resetShakeState();
  stopOutputs();
  Serial.println("[DESTINATION] Arrival alert active.");
}

void stopDestinationAlert(bool completed) {
  destinationAlertActive = false;
  destinationAlarmEnabled = false;
  destinationAlarmTriggered = completed;
  destinationAlarmCompleted = completed;
  currentStatus = completed ? "DESTINATION_CONFIRMED" : "SAFE";
  resetShakeState();
  stopOutputs();
}

void updateDestinationVibration(unsigned long currentMillis) {
  int onDuration = 400;
  int offDuration = 300;

  if (pulseState) {
    if (currentMillis - lastPulseToggleMs >= (unsigned long)onDuration) {
      digitalWrite(MOTOR_PIN, LOW);
      digitalWrite(BUZZER_PIN, LOW);
      pulseState = false;
      lastPulseToggleMs = currentMillis;
    }
  } else if (currentMillis - lastPulseToggleMs >= (unsigned long)offDuration) {
    if (vibrationEnabled) {
      digitalWrite(MOTOR_PIN, HIGH);
    }
    if (buzzerEnabled) {
      digitalWrite(BUZZER_PIN, HIGH);
    }
    pulseState = true;
    lastPulseToggleMs = currentMillis;
  }
}

bool trackShakeToStop(unsigned long currentMillis, float baseline) {
  if (!mpuFunctional)
    return false;

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float accelMag = sqrt(a.acceleration.x * a.acceleration.x +
                        a.acceleration.y * a.acceleration.y +
                        a.acceleration.z * a.acceleration.z);
  float gyroMag = sqrt(g.gyro.x * g.gyro.x +
                       g.gyro.y * g.gyro.y +
                       g.gyro.z * g.gyro.z);

  float accelDelta = abs(accelMag - 9.81f);

  // Distinguish intentional hand shaking gesture from normal walking steps:
  // Normal walking steps produce low-frequency ~1.2-1.8 m/s² vertical bouncing with gyro near zero (< 0.8 rad/s).
  // Intentional vigorous hand shaking produces high-rate angular rotation (gyro > 3.0 rad/s) OR sharp accel spikes (accelDelta > 4.0 m/s²).
  bool strongShake = (accelDelta > 4.0f) || (gyroMag > 3.0f);

  if (strongShake) {
    lastValidShakeTimeMs = currentMillis;

    if (!isShaking) {
      shakeStartTimeMs = currentMillis;
      isShaking = true;
    }

    return currentMillis - shakeStartTimeMs >=
           ((unsigned long)wakeShakeSec * 1000UL);
  }

  if (isShaking &&
      (currentMillis - lastValidShakeTimeMs > SHAKE_GAP_ALLOWED_MS)) {
    resetShakeState();
  }

  return false;
}

void sendSensorData() {
  if (pNotifyChar == nullptr) return;

  float shakeProgressSec = ((alarmActive || destinationAlertActive) && isShaking)
    ? (float)(millis() - shakeStartTimeMs) / 1000.0
    : 0.0;

  String json = "{";
  json += "\"alarm\":" + String((alarmActive || destinationAlertActive) ? "true" : "false") + ",";
  json += "\"atActive\":" + String(alarmActive ? "true" : "false") + ",";
  json += "\"atType\":" + String(alertType) + ",";
  json += "\"destEnabled\":" + String(destinationAlarmEnabled ? "true" : "false") + ",";
  json += "\"destTriggered\":" + String(destinationAlarmTriggered ? "true" : "false") + ",";
  json += "\"destCompleted\":" + String(destinationAlarmCompleted ? "true" : "false") + ",";
  json += "\"shakeSec\":" + String(wakeShakeSec) + ",";
  json += "\"shakeProgress\":" + String(shakeProgressSec, 2) + ",";
  json += "\"triggerDist\":" + String(triggerDistanceKm, 2) + ",";
  json += "\"status\":\"" + currentStatus + "\"";
  json += "}\n";

  if (deviceConnected) {
    pNotifyChar->setValue((const uint8_t *)json.c_str(), json.length());
    pNotifyChar->notify();
    Serial.print("[BLE NOTIFY] ");
    Serial.println(json);
  }
}

class MyServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *pServer) {
    deviceConnected = true;
    Serial.println("[BLE] Phone connected (v1).");
  }
  void onConnect(NimBLEServer *pServer, NimBLEConnInfo &connInfo) {
    deviceConnected = true;
    Serial.println("[BLE] Phone connected (v2).");
  }

  void onDisconnect(NimBLEServer *pServer) {
    deviceConnected = false;
    Serial.println("[BLE] Phone disconnected (v1). Advertising again.");
    NimBLEDevice::startAdvertising();
  }
  void onDisconnect(NimBLEServer *pServer, NimBLEConnInfo &connInfo, int reason) {
    deviceConnected = false;
    Serial.println("[BLE] Phone disconnected (v2). Advertising again.");
    NimBLEDevice::startAdvertising();
  }
};

class MyBLECallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic,
               NimBLEConnInfo &connInfo) override {
    std::string value = pCharacteristic->getValue();
    String command = String(value.c_str());
    command.trim();
    if (command.length() == 0)
      return;

    Serial.print("[BLE Command] Received: ");
    Serial.println(command);

    if (command.startsWith("AT:CONFIG:")) {
      String config = command.substring(10);
      int idx1 = config.indexOf(',');
      int idx2 = config.indexOf(',', idx1 + 1);
      if (idx1 > 0 && idx2 > 0) {
        enableReed = config.substring(0, idx1).toInt() == 1;
        enableLdr = config.substring(idx1 + 1, idx2).toInt() == 1;

        int idx3 = config.indexOf(',', idx2 + 1);
        if (idx3 > 0) {
          enableMpu = config.substring(idx2 + 1, idx3).toInt() == 1;
          buzzerEnabled = config.substring(idx3 + 1).toInt() == 1;
        } else {
          enableMpu = config.substring(idx2 + 1, idx3).toInt() == 1;
        }

        currentStatus = systemArmed ? "armed" : "SAFE";
        Serial.printf("[CONFIG] Reed=%d LDR=%d MPU=%d Buzzer=%d\n", enableReed,
                      enableLdr, enableMpu, buzzerEnabled);
      }
    } else if (command == "AT:ARM") {
      antiTheftMonitoringEnabled = true;
      systemArmed = true;
      startCalibrationPhase();
      Serial.println("[ARM] System armed from phone.");
    } else if (command == "AT:DISARM") {
      antiTheftMonitoringEnabled = false;
      systemArmed = false;
      calibrated = false;
      clearAntiTheftAlarm("SAFE");
      Serial.println("[DISARM] System disarmed from phone.");
    } else if (command == "AT:STOP") {
      clearAntiTheftAlarm("SAFE");
      if (antiTheftMonitoringEnabled && systemArmed) {
        startCalibrationPhase();
      }
      Serial.println(
          "[ANTI-THEFT STOP] Anti-theft alarm dismissed from phone.");
    } else if (command == "STOP") {
      stopDestinationAlert(false);
      clearAntiTheftAlarm("SAFE");
      if (antiTheftMonitoringEnabled && systemArmed) {
        startCalibrationPhase();
      }
      Serial.println("[STOP] Alarm stopped/dismissed from phone.");
    } else if (command == "BUZZER_ON") {
      buzzerEnabled = true;
      Serial.println("[CONFIG] Buzzer Enabled.");
    } else if (command == "BUZZER_OFF") {
      buzzerEnabled = false;
      Serial.println("[CONFIG] Buzzer Disabled.");
    } else if (command == "VIBRATION_ON") {
      vibrationEnabled = true;
      Serial.println("[CONFIG] Vibration Enabled.");
    } else if (command == "VIBRATION_OFF") {
      vibrationEnabled = false;
      Serial.println("[CONFIG] Vibration Disabled.");
    } else if (command == "DESTINATION_ALERT") {
      startDestinationAlert();
    } else if (command == "DESTINATION_STOP") {
      stopDestinationAlert(false);
    } else if (command.indexOf(',') > 0) {
      configureDestinationAlarm(command);
    }

    sendSensorData();
  }
};

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n=== SYSTEM INITIALIZING ===");

  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(MOTOR_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  digitalWrite(BUZZER_PIN, LOW);
  delay(100);

  pinMode(REED_PIN, INPUT_PULLUP);

  Wire.begin(MPU_SDA, MPU_SCL);
  if (!mpu.begin(0x68, &Wire) && !mpu.begin(0x69, &Wire)) {
    Serial.println(
        "[ERROR] MPU6050 Connection Failed on 0x68 & 0x69! Bypassing...");
    mpuFunctional = false;
  } else {
    Serial.println("[OK] MPU6050 Connected successfully!");
    mpuFunctional = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }

  NimBLEDevice::init("Alerto_Hardware");
  NimBLEDevice::setMTU(512);
  NimBLEServer *pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  NimBLEService *pService = pServer->createService(SERVICE_UUID);
  NimBLECharacteristic *pWriteChar = pService->createCharacteristic(
      WRITE_CHARACTERISTIC_UUID, NIMBLE_PROPERTY::WRITE);
  pWriteChar->setCallbacks(new MyBLECallbacks());

  pNotifyChar = pService->createCharacteristic(NOTIFY_CHARACTERISTIC_UUID,
                                               NIMBLE_PROPERTY::READ |
                                                   NIMBLE_PROPERTY::NOTIFY);

  pService->start();

  NimBLEAdvertising *pAdvertising = NimBLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->enableScanResponse(true);
  pAdvertising->start();
  Serial.println("[BLE] Advertising as 'Alerto_Hardware'...");

  Serial.println("SYSTEM INFO: Allowing 3 seconds to stabilize before baseline calibration...");
  delay(3000);
}

void loop() {
  unsigned long currentMillis = millis();

  // Handle 3-second calibration phase
  if (systemArmed && !calibrated) {
    if (calibrationStartMs == 0) {
      calibrationStartMs = currentMillis;
    }

    currentStatus = "calibrating";
    stopOutputs();

    unsigned long elapsedCal = currentMillis - calibrationStartMs;

    // Sample sensors during calibration window
    analogRead(LDR_PIN);
    if (mpuFunctional) {
      sensors_event_t a, g, t;
      mpu.getEvent(&a, &g, &t);
    }

    // Every 500ms send BLE update to app showing "calibrating"
    static unsigned long lastCalNotify = 0;
    if (currentMillis - lastCalNotify > 500) {
      sendSensorData();
      lastCalNotify = currentMillis;
    }

    if (elapsedCal >= CALIBRATION_DURATION_MS) {
      baselineLDR = analogRead(LDR_PIN);
      if (mpuFunctional) {
        sensors_event_t a, g, t;
        mpu.getEvent(&a, &g, &t);
        baselineMotion = sqrt(a.acceleration.x * a.acceleration.x +
                              a.acceleration.y * a.acceleration.y +
                              a.acceleration.z * a.acceleration.z);
      } else {
        baselineMotion = 9.8;
      }

      resetShakeState();
      pulseState = false;
      calibrated = true;
      currentStatus = "armed";
      calibrationStartMs = 0;

      Serial.println("\n==================================================");
      Serial.println("SYSTEM INFO: 3-second calibration window complete.");
      Serial.printf("   -> Baseline LDR: %d | Motion: %.2f\n", baselineLDR, baselineMotion);
      Serial.printf("   -> Reed Switch: %s\n", digitalRead(REED_PIN) == REED_CLOSED_STATE ? "CLOSED (Safe)" : "OPEN (Intrusion)");
      Serial.println("SYSTEM STATUS: Active monitoring engaged.");
      Serial.println("==================================================");

      sendSensorData();
    }

    delay(50);
    return;
  }

  if (alarmActive) {
    if (pulseState == true) {
      if (currentMillis - lastPulseToggleMs >= PULSE_ON_DURATION_MS) {
        digitalWrite(MOTOR_PIN, LOW);
        digitalWrite(BUZZER_PIN, LOW);
        pulseState = false;
        lastPulseToggleMs = currentMillis;
      }
    } else {
      if (currentMillis - lastPulseToggleMs >= PULSE_OFF_DURATION_MS) {
        if (vibrationEnabled) {
          digitalWrite(MOTOR_PIN, HIGH);
        }
        if (buzzerEnabled) {
          digitalWrite(BUZZER_PIN, HIGH);
        }
        pulseState = true;
        lastPulseToggleMs = currentMillis;
      }
    }

    if (mpuFunctional) {
      float motionDelta = readCombinedMotion();
      bool strongShake = (motionDelta > SHAKE_DISMISS_THRESHOLD);

      if (strongShake) {
        lastValidShakeTimeMs = currentMillis;

        if (!isShaking) {
          shakeStartTimeMs = currentMillis;
          isShaking = true;
          Serial.println("USER DISMISSAL: Shake threshold exceeded.");
        }

        unsigned long duration = currentMillis - shakeStartTimeMs;
        Serial.print("USER DISMISSAL: Gesturing tracked. Duration: ");
        Serial.print(duration / 1000.0);
        Serial.println("s / 3.0s");

        if (duration >= SHAKE_DISMISS_DURATION_MS) {
          Serial.println("USER DISMISSAL: Target achieved. Entering 3-second calibration reset.");
          startCalibrationPhase();
          sendSensorData();
          return;
        }
      } else {
        if (isShaking &&
            (currentMillis - lastValidShakeTimeMs > SHAKE_GAP_ALLOWED_MS)) {
          Serial.println("USER DISMISSAL: Timeout window breached. Resetting timeline parameters.");
          resetShakeState();
        }
      }
    }

    // Send sensor data every 1 second during active alarm so BLE client never misses intrusion state
    static unsigned long lastAlarmNotifyMs = 0;
    if (currentMillis - lastAlarmNotifyMs > 1000) {
      sendSensorData();
      lastAlarmNotifyMs = currentMillis;
    }

    delay(50);
    return;
  }

  if (destinationAlertActive) {
    currentStatus = "DESTINATION_REACHED";
    updateDestinationVibration(currentMillis);

    if (trackShakeToStop(currentMillis, destinationBaselineMotion)) {
      Serial.println("[DESTINATION] Shake duration reached. Arrival confirmed.");
      stopDestinationAlert(true);
      sendSensorData();
      return;
    }

    static unsigned long lastDestinationUpdate = 0;
    if (currentMillis - lastDestinationUpdate > 500) {
      sendSensorData();
      lastDestinationUpdate = currentMillis;
    }

    delay(50);
    return;
  }

  if (!systemArmed) {
    int reedState = digitalRead(REED_PIN);
    if (antiTheftMonitoringEnabled && reedState == REED_CLOSED_STATE) {
      systemArmed = true;
      startCalibrationPhase();
      Serial.println("[LOCAL ARM] Magnet closed. Starting 3-second calibration...");
      sendSensorData();
    }
    delay(100);
    return;
  }

  // 1. Reed Switch (Zipper) Anomaly: Magnet separated (pin equals REED_OPEN_STATE)
  if (enableReed && digitalRead(REED_PIN) == REED_OPEN_STATE) {
    Serial.println("ANOMALY DETECTED: Reed switch open (Magnet removed / Zipper opened).");
    alarmActive = true;
    alertType = 1;
    currentStatus = "THEFT_BAG_OPEN";
    pulseState = false;
    lastPulseToggleMs = currentMillis - PULSE_OFF_DURATION_MS;
    sendSensorData();
    return;
  }

  // 2. LDR Light Anomaly: Room light / opening bag (threshold 250)
  int currentLDR = analogRead(LDR_PIN);
  if (enableLdr && (abs(currentLDR - baselineLDR) > 250)) {
    Serial.println("ANOMALY DETECTED: Light intrusion.");
    alarmActive = true;
    alertType = 2;
    currentStatus = "THEFT_LIGHT_INTRUSION";
    pulseState = false;
    lastPulseToggleMs = currentMillis - PULSE_OFF_DURATION_MS;
    sendSensorData();
    return;
  }

  // 3. MPU Motion Anomaly: Snatch / sudden lift / rotation
  if (enableMpu && mpuFunctional) {
    float motionScore = readCombinedMotion();

    if (motionScore > MOTION_SNATCH_THRESHOLD) {
      Serial.printf(
          "ANOMALY DETECTED: Motion score %.2f exceeded threshold %.2f!\n",
          motionScore, MOTION_SNATCH_THRESHOLD);
      alarmActive = true;
      alertType = 3;
      currentStatus = "THEFT_MOTION_ALERT";
      pulseState = false;
      lastPulseToggleMs = currentMillis - PULSE_OFF_DURATION_MS;
      sendSensorData();
      return;
    }
  }

  static unsigned long lastUpdate = 0;
  if (currentMillis - lastUpdate > 2000) {
    if (mpuFunctional) {
      Serial.printf("[STATUS] System: %s | Motion: %.2f | LDR: %d | Reed: %s\n",
                    currentStatus.c_str(), readCombinedMotion(),
                    analogRead(LDR_PIN),
                    digitalRead(REED_PIN) == REED_CLOSED_STATE ? "CLOSED" : "OPEN");
    }
    sendSensorData();
    lastUpdate = currentMillis;
  }

  delay(100);
}

