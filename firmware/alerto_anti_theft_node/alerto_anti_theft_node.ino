#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <HardwareSerial.h>
#include <NimBLEDevice.h>
#include <TinyGPS++.h>
#include <Wire.h>
#include <math.h>

// ESP32-S3 PIN DEFINITIONS
#define MOTOR_PIN 1
#define BUZZER_PIN 2
#define BATTERY_PIN 3 // Disabled in code until battery is attached
#define LDR_PIN 4
#define REED_PIN 5
#define GPS_RX_PIN 6  // Connect to GPS TX
#define GPS_TX_PIN 7  // Connect to GPS RX
#define MPU_SDA 8     // Connect to MPU SDA
#define MPU_SCL 9     // Connect to MPU SCL
#define GSM_RX_PIN 12 // Connect to GSM TX
#define GSM_TX_PIN 13 // Connect to GSM RX

// REED_CLOSED_STATE = Magnet Present (Zipper Closed = SAFE) -> HIGH
// REED_OPEN_STATE   = Magnet Removed (Zipper Opened = INTRUSION) -> LOW
#define REED_CLOSED_STATE HIGH
#define REED_OPEN_STATE LOW

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define WRITE_CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define NOTIFY_CHARACTERISTIC_UUID "12345678-4321-4321-4321-123456789abc"

#define MIN_SATELLITES 3
#define MAX_CONTACTS 5
#define LDR_INTRUSION_THRESHOLD 950

// HARDWARE INSTANCES & SENSORS
TinyGPSPlus gps;
HardwareSerial gpsSerial(1);
Adafruit_MPU6050 mpu;
bool mpuFunctional = false;

// 1D Kalman Filter for GPS
class KalmanFilter {
private:
  float err_measure = 0.00005;
  float err_estimate = 0.00005;
  float q = 0.00001;
  float current_estimate = 0;
  float kalman_gain = 0;

public:
  float updateEstimate(float me) {
    kalman_gain = err_estimate / (err_estimate + err_measure);
    current_estimate = current_estimate + kalman_gain * (me - current_estimate);
    err_estimate = (1.0 - kalman_gain) * err_estimate + q;
    return current_estimate;
  }
  void setInitial(float val) { current_estimate = val; }
};

KalmanFilter kalmanLat;
KalmanFilter kalmanLng;

bool isGpsInitialized = false;
float filteredLat = 0.0;
float filteredLng = 0.0;
int currentSats = 0;
unsigned long rawBytesReceived = 0;
unsigned long lastGpsPrintTime = 0;
String gsmBuffer = "";

// EMERGENCY CONTACTS & DISCONNECT SMS
String ownerPhoneNumber = "";

String emergencyContactNumbers[MAX_CONTACTS];
int emergencyContactCount = 0;

String allContactNumbers[MAX_CONTACTS];
int allContactCount = 0;

bool bleEverConnected = false;
bool disconnectSmsPending = false;
bool disconnectSmsSent = false;
int smsSentCount = 0;
int smsFormatMode = 0;
bool alarmWasActiveOnDisconnect = false;
unsigned long disconnectTimeMs = 0;
const unsigned long DISCONNECT_GRACE_PERIOD_MS = 5000;
const unsigned long ALARM_DISCONNECT_GRACE_MS = 1500;

// ANTI-THEFT & COMMUTE MONITORING STATE
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
bool forceSoundActive = false;
unsigned long forceSoundStopAtMs = 0;
const unsigned long FORCE_SOUND_DURATION_MS = 2500;

unsigned long shakeStartTimeMs = 0;
unsigned long lastValidShakeTimeMs = 0;
bool isShaking = false;

const unsigned long SHAKE_DISMISS_DURATION_MS = 3000;
const unsigned long SHAKE_GAP_ALLOWED_MS = 1500;
const float MOTION_SNATCH_THRESHOLD = 1.8;
const float SHAKE_DISMISS_THRESHOLD = 2.2;

// MOTION & BATTERY FUNCTIONS (BYPASSED)
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

  return abs(accelMag - 9.81f) + (gyroMag * 1.5f);
}

float readMotionMagnitude() { return readCombinedMotion(); }

// Battery monitoring temporarily bypassed for USB power
float readBatteryVoltage() { return 0.0f; }

int getBatteryPercent(float voltage) { return 100; }

void resetShakeState() {
  isShaking = false;
  shakeStartTimeMs = 0;
  lastValidShakeTimeMs = 0;
}

void stopOutputs() {
  forceSoundActive = false;
  digitalWrite(MOTOR_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  pulseState = false;
}

void triggerForceSound(unsigned long currentMillis) {
  forceSoundActive = true;
  forceSoundStopAtMs = currentMillis + FORCE_SOUND_DURATION_MS;
  digitalWrite(MOTOR_PIN, HIGH);
  digitalWrite(BUZZER_PIN, HIGH);
  pulseState = true;
  lastPulseToggleMs = currentMillis;
  Serial.println("[FORCE SOUND] Buzzer and vibration triggered from phone.");
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

  pulseState = true;
  lastPulseToggleMs = millis();
  if (vibrationEnabled)
    digitalWrite(MOTOR_PIN, HIGH);
  if (buzzerEnabled)
    digitalWrite(BUZZER_PIN, HIGH);

  Serial.printf("[DESTINATION] Arrival alert active. Buzzer=%d Vib=%d\n",
                buzzerEnabled, vibrationEnabled);
}

void stopDestinationAlert(bool completed) {
  destinationAlertActive = false;
  destinationAlarmEnabled = false;
  destinationAlarmTriggered = completed;
  destinationAlarmCompleted = completed;
  currentStatus = completed ? "DESTINATION_CONFIRMED" : "SAFE";
  resetShakeState();
  stopOutputs();

  if (completed && antiTheftMonitoringEnabled && systemArmed) {
    Serial.println("[DEST->AT] Arrival confirmed. Re-arming anti-theft with "
                   "fresh calibration.");
    startCalibrationPhase();
  }
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
    if (vibrationEnabled)
      digitalWrite(MOTOR_PIN, HIGH);
    if (buzzerEnabled)
      digitalWrite(BUZZER_PIN, HIGH);
    pulseState = true;
    lastPulseToggleMs = currentMillis;
  }
}

bool trackShakeToStop(unsigned long currentMillis, float baseline) {
  if (!mpuFunctional)
    return false;

  float motionScore = readCombinedMotion();
  bool strongShake = (motionScore > SHAKE_DISMISS_THRESHOLD);

  if (strongShake) {
    lastValidShakeTimeMs = currentMillis;

    if (!isShaking) {
      shakeStartTimeMs = currentMillis;
      isShaking = true;
      Serial.println("[DEST SHAKE] Hand shake gesture started.");
    }

    unsigned long elapsed = currentMillis - shakeStartTimeMs;
    return elapsed >= ((unsigned long)wakeShakeSec * 1000UL);
  }

  if (isShaking &&
      (currentMillis - lastValidShakeTimeMs > SHAKE_GAP_ALLOWED_MS)) {
    resetShakeState();
    Serial.println("[DEST SHAKE] Hand shake interrupted/timed out.");
  }

  return false;
}

// GSM & SMS ROUTINES
String sendAndLogAT(String cmd, unsigned int timeoutMs = 350) {
  Serial.print("[AT CMD] ");
  Serial.println(cmd);

  while (Serial2.available())
    Serial2.read();
  Serial2.println(cmd);

  unsigned long start = millis();
  String resp = "";
  while (millis() - start < timeoutMs) {
    while (Serial2.available()) {
      resp += (char)Serial2.read();
    }
    if (resp.indexOf("OK") != -1 || resp.indexOf("ERROR") != -1)
      break;
    delay(5);
  }
  resp.trim();
  Serial.print("[AT RESP]: ");
  Serial.println(resp.length() > 0 ? resp : "[NO RESPONSE/TIMEOUT]");
  return resp;
}

void runGSMDiagnostics() {
  Serial.println("\n======== GSM QUICK DIAGNOSTICS ========");
  String ping = sendAndLogAT("AT", 300);
  if (ping.indexOf("OK") == -1) {
    Serial.println("[GSM] Modem not responding (offline/unpowered). Skipping "
                   "verbose diagnostics.");
    Serial.println("=======================================\n");
    return;
  }

  sendAndLogAT("ATE0", 300);
  sendAndLogAT("AT+CPIN?", 400);
  sendAndLogAT("AT+CSQ", 300);
  sendAndLogAT("AT+CREG?", 300);
  sendAndLogAT("AT+CMGF=1", 300);
  sendAndLogAT("AT+CSCS=\"GSM\"", 300);
  Serial.println("=======================================\n");
}

bool sendSingleSMS(String recipient, String textPayload) {
  if (recipient.length() < 7) {
    Serial.printf("[GSM] Invalid recipient phone number: '%s'\n",
                  recipient.c_str());
    return false;
  }

  Serial2.println("AT+CMGF=1");
  delay(150);

  while (Serial2.available())
    Serial2.read();

  // Send AT+CMGS with \r only (CR) — standard GSM AT command spec
  Serial2.print("AT+CMGS=\"");
  Serial2.print(recipient);
  Serial2.print("\"\r");

  unsigned long start = millis();
  bool promptReceived = false;
  while (millis() - start < 5000) {
    if (Serial2.available()) {
      char c = Serial2.read();
      if (c == '>') {
        promptReceived = true;
        break;
      }
    }
    delay(5);
  }

  if (!promptReceived) {
    Serial.println("[GSM] Failed to receive SMS prompt '>' from modem.");
    return false;
  }

  delay(100);
  Serial2.print(textPayload);
  delay(100);
  Serial2.write(26); // ASCII 26: Ctrl+Z

  start = millis();
  String response = "";
  while (millis() - start < 15000) {
    while (Serial2.available()) {
      response += (char)Serial2.read();
    }
    if (response.indexOf("OK") != -1 || response.indexOf("ERROR") != -1 || response.indexOf("+CMGS:") != -1)
      break;
    delay(10);
  }

  bool success =
      (response.indexOf("OK") != -1 || response.indexOf("+CMGS:") != -1);
  if (success) {
    smsSentCount++;
    Serial.printf("[GSM] SMS to %s SENT SUCCESS (total sent: %d)\n",
                  recipient.c_str(), smsSentCount);
  } else {
    Serial.printf("[GSM] SMS to %s FAILED: %s\n", recipient.c_str(), response.c_str());
  }
  return success;
}

void sendAlertoLocationSMS(String recipientNumber, float lat, float lng) {
  recipientNumber.replace("\"", "");
  recipientNumber.trim();
  if (recipientNumber.length() < 7) {
    Serial.println("[ALERTO] Invalid recipient number for SMS reply.");
    return;
  }

  // Check fallback raw GPS if filtered is zero
  if (lat == 0.0 && lng == 0.0 && gps.location.isValid()) {
    lat = gps.location.lat();
    lng = gps.location.lng();
  }

  bool hasValidFix = (lat != 0.0 || lng != 0.0);
  if (!hasValidFix) {
    Serial.println("[ALERTO] Replying to WHERE: GPS fix pending...");
    String msg = "ALERTO Device: No GPS fix yet (Sats: " + String(currentSats) +
                 "). Please text WHERE again.";
    sendSingleSMS(recipientNumber, msg);
    return;
  }

  if (smsFormatMode == 0) {
    // Combined Mode: single SMS with header and plain coordinates
    Serial.print("\n[ALERTO] Sending COMBINED SMS to: ");
    Serial.println(recipientNumber);
    String msg = "ALERTO Device Location: " + String(lat, 6) + "," + String(lng, 6);
    sendSingleSMS(recipientNumber, msg);
  } else if (smsFormatMode == 2) {
    // Coordinates-Only Mode: raw numeric output
    Serial.print("\n[ALERTO] Sending COORDINATES ONLY SMS to: ");
    Serial.println(recipientNumber);
    String msg = String(lat, 6) + "," + String(lng, 6);
    sendSingleSMS(recipientNumber, msg);
  } else {
    // Separate Mode: two SMS messages with a short delay
    Serial.print("\n[ALERTO] Initiating 2-Part Separate SMS transmission to: ");
    Serial.println(recipientNumber);

    String msg1 = "ALERTO Location acquired! Coordinates follow:";
    String msg2 = String(lat, 6) + "," + String(lng, 6);

    sendSingleSMS(recipientNumber, msg1);
    delay(1500); // short pause between messages
    sendSingleSMS(recipientNumber, msg2);
  }
}

void sendDisconnectionAlertSMS(float lat, float lng, bool alarmActive) {
  String alertType =
      alarmActive ? "ALARM WAS ACTIVE" : "Bluetooth Disconnected";
  Serial.printf("\n[ALERTO] Sending Disconnect SMS [%s] to ALL contacts...\n",
                alertType.c_str());

  String locText = (lat != 0.0 || lng != 0.0)
                       ? (String(lat, 6) + ", " + String(lng, 6))
                       : "No GPS fix";

  String msg =
      "ALERTO ALERT!\n" + alertType + "\nDevice last location:\n" + locText;

  if (ownerPhoneNumber.length() >= 7) {
    sendSingleSMS(ownerPhoneNumber, msg);
    delay(2000);
  }

  for (int i = 0; i < allContactCount; i++) {
    if (allContactNumbers[i].length() >= 7 &&
        allContactNumbers[i] != ownerPhoneNumber) {
      sendSingleSMS(allContactNumbers[i], msg);
      delay(2000);
    }
  }
}

void processStoredSMS(int index) {
  Serial.printf("\n[GSM] Reading stored SMS index %d...\n", index);
  while (Serial2.available()) Serial2.read();
  Serial2.printf("AT+CMGR=%d\r", index);
  unsigned long start = millis();
  String readBuf = "";
  while (millis() - start < 4000) {
    while (Serial2.available()) {
      readBuf += (char)Serial2.read();
    }
    if (readBuf.indexOf("OK") != -1 || readBuf.indexOf("ERROR") != -1)
      break;
    delay(10);
  }

  int cmgrIndex = readBuf.indexOf("+CMGR:");
  if (cmgrIndex != -1) {
    String upper = readBuf;
    upper.toUpperCase();
    if (upper.indexOf("WHERE") != -1 || upper.indexOf("LOCAT") != -1) {
      int firstQuote = readBuf.indexOf("\"", cmgrIndex);
      int secondQuote = readBuf.indexOf("\"", firstQuote + 1);
      int thirdQuote = readBuf.indexOf("\"", secondQuote + 1);
      int fourthQuote = readBuf.indexOf("\"", thirdQuote + 1);
      String sender = "";
      if (thirdQuote != -1 && fourthQuote != -1) {
        sender = readBuf.substring(thirdQuote + 1, fourthQuote);
      } else if (firstQuote != -1 && secondQuote != -1) {
        sender = readBuf.substring(firstQuote + 1, secondQuote);
      }
      sender.replace("\"", "");
      sender.trim();
      if (sender.length() >= 7) {
        Serial.printf("[GSM] WHERE inquiry received from %s via stored SMS!\n",
                      sender.c_str());
        sendAlertoLocationSMS(sender, filteredLat, filteredLng);
      }
    }
  }

  // Delete message from SIM so memory never fills up
  Serial2.printf("AT+CMGD=%d\r", index);
  delay(150);
  while (Serial2.available())
    Serial2.read();
}

unsigned long lastUnreadSmsCheckMs = 0;

void checkUnreadSMS() {
  while (Serial2.available()) Serial2.read();
  Serial2.println("AT+CMGL=\"REC UNREAD\"");
  unsigned long start = millis();
  String readBuf = "";
  while (millis() - start < 3000) {
    while (Serial2.available()) {
      readBuf += (char)Serial2.read();
    }
    if (readBuf.indexOf("OK") != -1 || readBuf.indexOf("ERROR") != -1)
      break;
    delay(10);
  }

  int searchIdx = 0;
  bool foundAny = false;
  while ((searchIdx = readBuf.indexOf("+CMGL:", searchIdx)) != -1) {
    foundAny = true;
    int endLine = readBuf.indexOf("\n", searchIdx);
    if (endLine == -1) break;

    int firstComma = readBuf.indexOf(",", searchIdx);
    int secondComma = readBuf.indexOf(",", firstComma + 1);
    int firstQuote = readBuf.indexOf("\"", secondComma);
    int secondQuote = readBuf.indexOf("\"", firstQuote + 1);

    String sender = "";
    if (firstQuote != -1 && secondQuote != -1) {
      sender = readBuf.substring(firstQuote + 1, secondQuote);
      sender.replace("\"", "");
      sender.trim();
    }

    int nextLineEnd = readBuf.indexOf("\n", endLine + 1);
    String body = (nextLineEnd != -1) ? readBuf.substring(endLine + 1, nextLineEnd) : readBuf.substring(endLine + 1);
    body.toUpperCase();

    if (body.indexOf("WHERE") != -1 || body.indexOf("LOCAT") != -1) {
      if (sender.length() >= 7) {
        Serial.printf("[GSM] WHERE inquiry found via unread scan from %s!\n", sender.c_str());
        sendAlertoLocationSMS(sender, filteredLat, filteredLng);
      }
    }

    searchIdx = (nextLineEnd != -1) ? nextLineEnd + 1 : endLine + 1;
  }

  if (foundAny) {
    Serial2.println("AT+CMGD=1,4");
    delay(150);
    while (Serial2.available()) Serial2.read();
  }
}

void processIncomingGSM() {
  while (Serial2.available()) {
    char c = Serial2.read();
    gsmBuffer += c;
    Serial.write(c);
  }

  // 1. Check for stored SMS notification (+CMTI: "SM", <index>)
  int cmtiIndex = gsmBuffer.indexOf("+CMTI:");
  if (cmtiIndex != -1) {
    int newlineIndex = gsmBuffer.indexOf("\n", cmtiIndex);
    if (newlineIndex != -1) {
      int commaIndex = gsmBuffer.indexOf(",", cmtiIndex);
      if (commaIndex != -1 && commaIndex < newlineIndex) {
        String idxStr = gsmBuffer.substring(commaIndex + 1, newlineIndex);
        idxStr.trim();
        int index = idxStr.toInt();
        if (index > 0) {
          processStoredSMS(index);
        }
      }
      gsmBuffer = gsmBuffer.substring(newlineIndex + 1);
      return;
    }
  }

  // 2. Check for direct stream SMS (+CMT:)
  int cmtIndex = gsmBuffer.indexOf("+CMT:");
  if (cmtIndex != -1) {
    int firstNewline = gsmBuffer.indexOf("\n", cmtIndex);
    if (firstNewline != -1) {
      int secondNewline = gsmBuffer.indexOf("\n", firstNewline + 1);
      if (secondNewline != -1 || gsmBuffer.length() - firstNewline > 30) {
        String upperBuffer = gsmBuffer.substring(cmtIndex);
        upperBuffer.toUpperCase();

        if (upperBuffer.indexOf("WHERE") != -1 ||
            upperBuffer.indexOf("LOCAT") != -1) {
          int firstQuote = gsmBuffer.indexOf("\"", cmtIndex);
          int secondQuote = gsmBuffer.indexOf("\"", firstQuote + 1);

          if (firstQuote != -1 && secondQuote != -1) {
            String senderNumber = gsmBuffer.substring(firstQuote + 1, secondQuote);
            senderNumber.replace("\"", "");
            senderNumber.trim();
            if (senderNumber.length() >= 7) {
              Serial.printf(
                  "[GSM] WHERE inquiry received from %s via direct SMS!\n",
                  senderNumber.c_str());
              sendAlertoLocationSMS(senderNumber, filteredLat, filteredLng);
            }
          }
        }
        gsmBuffer = (secondNewline != -1) ? gsmBuffer.substring(secondNewline + 1) : "";
      }
    }
  } else if (gsmBuffer.length() > 500) {
    gsmBuffer = "";
  }
}

// BLE SENSOR DATA TRANSMISSION
void sendSensorData() {
  if (pNotifyChar == nullptr)
    return;

  float shakeProgressSec =
      ((alarmActive || destinationAlertActive) && isShaking)
          ? (float)(millis() - shakeStartTimeMs) / 1000.0
          : 0.0;
  float batteryVoltage = readBatteryVoltage();
  int batteryPercent = getBatteryPercent(batteryVoltage);

  String json = "{";
  json += "\"alm\":" + String((alarmActive || destinationAlertActive) ? 1 : 0) +
          ",";
  json += "\"at\":" + String(alarmActive ? 1 : 0) + ",";
  json += "\"att\":" + String(alertType) + ",";
  json += "\"de\":" + String(destinationAlarmEnabled ? 1 : 0) + ",";
  json += "\"dt\":" + String(destinationAlarmTriggered ? 1 : 0) + ",";
  json += "\"dc\":" + String(destinationAlarmCompleted ? 1 : 0) + ",";
  json += "\"shk\":" + String(wakeShakeSec) + ",";
  json += "\"prog\":" + String(shakeProgressSec, 2) + ",";
  json += "\"trg\":" + String(triggerDistanceKm, 2) + ",";
  json += "\"bat\":" + String(batteryPercent) + ",";
  json += "\"vb\":" + String(batteryVoltage, 2) + ",";
  json += "\"lat\":" + String(filteredLat, 6) + ",";
  json += "\"lng\":" + String(filteredLng, 6) + ",";
  json += "\"sat\":" + String(currentSats) + ",";
  json += "\"ss\":" + String(smsSentCount) + ",";
  json += "\"sf\":" + String(smsFormatMode) + ",";
  json += "\"shking\":" + String(isShaking ? 1 : 0) + ",";
  json += "\"st\":\"" + currentStatus + "\"";
  json += "}\n";

  if (deviceConnected) {
    pNotifyChar->setValue((const uint8_t *)json.c_str(), json.length());
    pNotifyChar->notify();
    Serial.print("[BLE NOTIFY] ");
    Serial.println(json);
  }
}

// BLE CALLBACKS & COMMAND HANDLERS
class MyServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer *pServer) {
    deviceConnected = true;
    bleEverConnected = true;
    disconnectSmsPending = false;
    disconnectSmsSent = false;
    alarmWasActiveOnDisconnect = false;
    Serial.println("[BLE] Phone connected.");
  }
  void onConnect(NimBLEServer *pServer, NimBLEConnInfo &connInfo) {
    deviceConnected = true;
    bleEverConnected = true;
    disconnectSmsPending = false;
    disconnectSmsSent = false;
    alarmWasActiveOnDisconnect = false;
    Serial.println("[BLE] Phone connected.");
  }

  void onDisconnect(NimBLEServer *pServer) {
    deviceConnected = false;
    disconnectTimeMs = millis();
    disconnectSmsPending = true;
    alarmWasActiveOnDisconnect = (alarmActive || destinationAlertActive);
    Serial.printf(
        "[BLE] Disconnected. AlarmActive=%d — grace period starting.\n",
        alarmWasActiveOnDisconnect ? 1 : 0);
    NimBLEDevice::startAdvertising();
  }
  void onDisconnect(NimBLEServer *pServer, NimBLEConnInfo &connInfo,
                    int reason) {
    deviceConnected = false;
    disconnectTimeMs = millis();
    disconnectSmsPending = true;
    alarmWasActiveOnDisconnect = (alarmActive || destinationAlertActive);
    Serial.printf(
        "[BLE] Disconnected. AlarmActive=%d — grace period starting.\n",
        alarmWasActiveOnDisconnect ? 1 : 0);
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
      int idx3 = config.indexOf(',', idx2 + 1);
      int idx4 = config.indexOf(',', idx3 + 1);
      int idx5 = config.indexOf(',', idx4 + 1);

      if (idx1 > 0 && idx2 > 0 && idx3 > 0) {
        enableReed = config.substring(0, idx1).toInt() == 1;
        enableLdr = config.substring(idx1 + 1, idx2).toInt() == 1;
        enableMpu = config.substring(idx2 + 1, idx3).toInt() == 1;
        buzzerEnabled = (idx4 > 0) ? (config.substring(idx3 + 1, idx4).toInt() == 1) : (config.substring(idx3 + 1).toInt() == 1);
        if (idx4 > 0) vibrationEnabled = (config.substring(idx4 + 1, (idx5 > 0 ? idx5 : config.length())).toInt() == 1);
        if (idx5 > 0) smsFormatMode = config.substring(idx5 + 1).toInt();
        currentStatus = systemArmed ? "armed" : "SAFE";
      }
    } else if (command == "SMS:COMBINED" || command == "AT:SMSFMT:0" || command == "SF:0") {
      smsFormatMode = 0;
      Serial.println("[BLE] SMS format set to: COMBINED (0)");
    } else if (command == "SMS:SEPARATE" || command == "AT:SMSFMT:1" || command == "SF:1") {
      smsFormatMode = 1;
      Serial.println("[BLE] SMS format set to: SEPARATE (1)");
    } else if (command == "SMS:COORDS_ONLY" || command == "AT:SMSFMT:2" || command == "SF:2") {
      smsFormatMode = 2;
      Serial.println("[BLE] SMS format set to: COORDS_ONLY (2)");
    } else if (command.startsWith("AT:SMSFMT:") || command.startsWith("SF:")) {
      int colonIdx = command.indexOf(':');
      if (colonIdx != -1) {
        smsFormatMode = command.substring(colonIdx + 1).toInt();
        Serial.printf("[BLE] SMS format mode set to %d\n", smsFormatMode);
      }
    } else if (command == "BUZZER_ON") {
      buzzerEnabled = true;
      Serial.println("[BLE] Buzzer ENABLED");
    } else if (command == "BUZZER_OFF") {
      buzzerEnabled = false;
      Serial.println("[BLE] Buzzer DISABLED");
    } else if (command == "VIBRATION_ON") {
      vibrationEnabled = true;
      Serial.println("[BLE] Vibration ENABLED");
    } else if (command == "VIBRATION_OFF") {
      vibrationEnabled = false;
      Serial.println("[BLE] Vibration DISABLED");
    } else if (command == "AT:ARM") {
      antiTheftMonitoringEnabled = true;
      systemArmed = true;
      startCalibrationPhase();
    } else if (command == "AT:DISARM") {
      antiTheftMonitoringEnabled = false;
      systemArmed = false;
      calibrated = false;
      clearAntiTheftAlarm("ANTI_THEFT_DISARMED");
    } else if (command == "AT:STOP" || command == "STOP" || command == "DS") {
      stopDestinationAlert(false);
      clearAntiTheftAlarm("SAFE");
      if (antiTheftMonitoringEnabled && systemArmed)
        startCalibrationPhase();
    } else if (command == "FORCE_SOUND") {
      buzzerEnabled = true;
      vibrationEnabled = true;
      triggerForceSound(millis());
    } else if (command.startsWith("DA")) {
      String payload = command.startsWith("DA:") ? command.substring(3) : "";
      int commaIdx = payload.indexOf(',');
      
      if (commaIdx != -1) {
        buzzerEnabled = (payload.substring(0, commaIdx).toInt() == 1);
        vibrationEnabled = (payload.substring(commaIdx + 1).toInt() == 1);
      } else if (payload.length() > 0) {
        bool flag = (payload.toInt() == 1);
        buzzerEnabled = flag;
        vibrationEnabled = flag;
      }
      startDestinationAlert();
      sendSensorData();
      return;
    } else if (command.startsWith("CA:") || command.startsWith("CS:") || command.startsWith("CT:")) {
      String payload = command.substring(command.indexOf(':') + 1);
      int s1 = payload.indexOf(';');
      if (s1 != -1) {
        ownerPhoneNumber = payload.substring(0, s1);
        ownerPhoneNumber.trim();
        String rest = payload.substring(s1 + 1);
        allContactCount = 0;
        while (rest.length() > 0 && allContactCount < MAX_CONTACTS) {
          int ns = rest.indexOf(';');
          String n = (ns != -1) ? rest.substring(0, ns) : rest;
          n.trim();
          if (n.length() >= 7)
            allContactNumbers[allContactCount++] = n;
          if (ns == -1)
            break;
          rest = rest.substring(ns + 1);
        }
      }
    } else if (command.indexOf(',') > 0) {
      configureDestinationAlarm(command);
    }

    sendSensorData();
  }
};

// SETUP
void setup() {
  Serial.begin(115200);

  while (!Serial && millis() < 3000)
    ;

  Serial.println("\n=== ANY-SAT GPS + UDR + ALERTO GSM: ESP32-S3 ===");

  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  // pinMode(BATTERY_PIN, INPUT); // Bypassed while running on USB

  digitalWrite(MOTOR_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // Single short startup chirp
  digitalWrite(BUZZER_PIN, HIGH);
  delay(40);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(REED_PIN, INPUT_PULLUP);
  // 1. INITIALIZE NIMBLE BLUETOOTH
  NimBLEDevice::init("Alerto_Hardware");
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
  pAdvertising->setName("Alerto_Hardware");
  pAdvertising->enableScanResponse(true);
  pAdvertising->start();
  Serial.println("[BLE] Advertising ready!");
  // 2. INITIALIZE SERIAL PORTS & SENSORS
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial2.begin(115200, SERIAL_8N1, GSM_RX_PIN, GSM_TX_PIN);
  // Initialize MPU6050 with non-blocking check
  Wire.setTimeOut(100);
  Wire.begin(MPU_SDA, MPU_SCL);
  if (!mpu.begin(0x68, &Wire) && !mpu.begin(0x69, &Wire)) {
    Serial.println("[ERROR] MPU6050 Connection Failed! Bypassing...");
    mpuFunctional = false;
  } else {
    Serial.println("[OK] MPU6050 Connected successfully!");
    mpuFunctional = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }
  // 3. GSM SETUP
  runGSMDiagnostics();
  sendAndLogAT("AT+CMGF=1", 300);
  sendAndLogAT("AT+CPMS=\"SM\",\"SM\",\"SM\"", 300);
  sendAndLogAT("AT+CNMI=2,1,0,0,0", 300);

  while (Serial2.available())
    Serial2.read();
  gsmBuffer = "";

  Serial.println("\n=== SYSTEM READY: Active monitoring initialized ===");
}

// MAIN LOOP
void loop() {
  unsigned long currentMillis = millis();

  sensors_event_t a, g, temp;
  if (mpuFunctional) {
    mpu.getEvent(&a, &g, &temp);
  }
  // 1. INGEST GPS BYTES & UPDATE POSITIONING
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    rawBytesReceived++;
    gps.encode(c);
  }

  if (gps.satellites.isValid()) {
    currentSats = gps.satellites.value();
  }

  if (gps.location.isValid() && gps.location.age() < 5000 &&
      currentSats >= MIN_SATELLITES) {
    float rawLat = gps.location.lat();
    float rawLng = gps.location.lng();

    if (!isGpsInitialized) {
      kalmanLat.setInitial(rawLat);
      kalmanLng.setInitial(rawLng);
      isGpsInitialized = true;
      Serial.println("[GPS LOCK] Baseline initialized!");
    }

    filteredLat = kalmanLat.updateEstimate(rawLat);
    filteredLng = kalmanLng.updateEstimate(rawLng);

    if (currentMillis - lastGpsPrintTime > 2000) {
      Serial.printf("[GPS LOCK] Lat: %.6f, Lng: %.6f | Sats: %d\n", filteredLat,
                    filteredLng, currentSats);
      lastGpsPrintTime = currentMillis;
    }
  } else if (isGpsInitialized && mpuFunctional) {
    float accelMag = sqrt(a.acceleration.x * a.acceleration.x +
                          a.acceleration.y * a.acceleration.y +
                          a.acceleration.z * a.acceleration.z);

    if (accelMag > 1.0 && abs(accelMag - 9.81) > 0.60) {
      filteredLat += 0.000002;
      filteredLng += 0.000002;

      if (currentMillis - lastGpsPrintTime > 1000) {
        Serial.printf("[UDR STEP] Lat: %.6f, Lng: %.6f\n", filteredLat,
                      filteredLng);
        lastGpsPrintTime = currentMillis;
      }
    } else if (currentMillis - lastGpsPrintTime > 1500) {
      Serial.printf("[UDR IDLE] Sats: %d | Lat/Lng: %.6f, %.6f\n", currentSats,
                    filteredLat, filteredLng);
      lastGpsPrintTime = currentMillis;
    }
  } else {
    if (currentMillis - lastGpsPrintTime > 1500) {
      Serial.printf("Waiting for Valid Fix | Sats: %d | Bytes Rx: %lu\n",
                    currentSats, rawBytesReceived);
      lastGpsPrintTime = currentMillis;
    }
  }
  // 2. PROCESS INCOMING GSM
  processIncomingGSM();
  if (currentMillis - lastUnreadSmsCheckMs >= 4000 && !disconnectSmsPending) {
    lastUnreadSmsCheckMs = currentMillis;
    checkUnreadSMS();
  }
  // 3. BLUETOOTH DISCONNECTION -> SMS AUTO-ALERT (Only send if intrusion/alarm was active)
  if (disconnectSmsPending && !deviceConnected && bleEverConnected) {
    if (alarmWasActiveOnDisconnect) {
      if (currentMillis - disconnectTimeMs >= ALARM_DISCONNECT_GRACE_MS && !disconnectSmsSent) {
        disconnectSmsPending = false;
        disconnectSmsSent = true;
        sendDisconnectionAlertSMS(filteredLat, filteredLng, true);
      }
    } else {
      // Normal disconnect without active intrusion — do not send SMS to save load
      disconnectSmsPending = false;
    }
  }
  // 4. FORCE SOUND LOGIC
  if (forceSoundActive) {
    if ((long)(currentMillis - forceSoundStopAtMs) < 0) {
      digitalWrite(MOTOR_PIN, HIGH);
      digitalWrite(BUZZER_PIN, HIGH);
      delay(20);
      return;
    }
    forceSoundActive = false;
    if (!alarmActive && !destinationAlertActive)
      stopOutputs();
  }
  // 5. ANTI-THEFT CALIBRATION PHASE
  if (systemArmed && !calibrated) {
    if (calibrationStartMs == 0)
      calibrationStartMs = currentMillis;
    currentStatus = "calibrating";
    stopOutputs();

    if (currentMillis - calibrationStartMs >= CALIBRATION_DURATION_MS) {
      baselineLDR = analogRead(LDR_PIN);
      baselineMotion = mpuFunctional
                           ? sqrt(a.acceleration.x * a.acceleration.x +
                                  a.acceleration.y * a.acceleration.y +
                                  a.acceleration.z * a.acceleration.z)
                           : 9.8;

      resetShakeState();
      calibrated = true;
      currentStatus = "armed";
      calibrationStartMs = 0;

      Serial.println("SYSTEM STATUS: Active monitoring engaged.");
      sendSensorData();
    }
    delay(10);
    return;
  }
  // 6. ACTIVE ALARM (ANTI-THEFT) PULSING
  if (alarmActive) {
    if (pulseState) {
      if (currentMillis - lastPulseToggleMs >= PULSE_ON_DURATION_MS) {
        digitalWrite(MOTOR_PIN, LOW);
        digitalWrite(BUZZER_PIN, LOW);
        pulseState = false;
        lastPulseToggleMs = currentMillis;
      }
    } else if (currentMillis - lastPulseToggleMs >= PULSE_OFF_DURATION_MS) {
      if (vibrationEnabled)
        digitalWrite(MOTOR_PIN, HIGH);
      if (buzzerEnabled)
        digitalWrite(BUZZER_PIN, HIGH);
      pulseState = true;
      lastPulseToggleMs = currentMillis;
    }

    if (mpuFunctional && readCombinedMotion() > SHAKE_DISMISS_THRESHOLD) {
      lastValidShakeTimeMs = currentMillis;
      if (!isShaking) {
        shakeStartTimeMs = currentMillis;
        isShaking = true;
      }
      if (currentMillis - shakeStartTimeMs >= SHAKE_DISMISS_DURATION_MS) {
        startCalibrationPhase();
        sendSensorData();
        return;
      }
    } else if (isShaking &&
               (currentMillis - lastValidShakeTimeMs > SHAKE_GAP_ALLOWED_MS)) {
      resetShakeState();
    }
    delay(10);
    return;
  }
  // 7. DESTINATION ARRIVAL ALERT
  if (destinationAlertActive) {
    currentStatus = "DESTINATION_REACHED";
    updateDestinationVibration(currentMillis);

    if (trackShakeToStop(currentMillis, destinationBaselineMotion)) {
      stopDestinationAlert(true);
      sendSensorData();
      return;
    }
    delay(10);
    return;
  }
  // 8. ANTI-THEFT SENSOR CHECKS
  if (systemArmed && calibrated) {
    if (enableReed && digitalRead(REED_PIN) == REED_OPEN_STATE) {
      alarmActive = true;
      alertType = 1;
      currentStatus = "THEFT_BAG_OPEN";
      sendSensorData();
      return;
    }

    if (enableLdr &&
        (abs(analogRead(LDR_PIN) - baselineLDR) > LDR_INTRUSION_THRESHOLD)) {
      alarmActive = true;
      alertType = 2;
      currentStatus = "THEFT_LIGHT_INTRUSION";
      sendSensorData();
      return;
    }

    if (enableMpu && mpuFunctional &&
        readCombinedMotion() > MOTION_SNATCH_THRESHOLD) {
      alarmActive = true;
      alertType = 3;
      currentStatus = "THEFT_MOTION_ALERT";
      sendSensorData();
      return;
    }
  }

  delay(10);
  yield();
}