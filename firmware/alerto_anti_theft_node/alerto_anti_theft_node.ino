#include <HardwareSerial.h>
#include <TinyGPS++.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <NimBLEDevice.h>
#include <math.h>

// ==========================================
// ESP32-S3 PIN DEFINITIONS
// ==========================================
#define MOTOR_PIN 1
#define BUZZER_PIN 2
#define BATTERY_PIN 3
#define LDR_PIN 4
#define REED_PIN 5
#define GPS_RX_PIN 6   // Connect to GPS TX
#define GPS_TX_PIN 7   // Connect to GPS RX
#define MPU_SDA 8      // Connect to MPU SDA
#define MPU_SCL 9      // Connect to MPU SCL
#define GSM_RX_PIN 12  // Connect to GSM TX
#define GSM_TX_PIN 13  // Connect to GSM RX

// Reed Switch Logic:
// REED_CLOSED_STATE = Magnet Present (Zipper Closed = SAFE) -> HIGH
// REED_OPEN_STATE   = Magnet Removed (Zipper Opened = INTRUSION) -> LOW
#define REED_CLOSED_STATE HIGH
#define REED_OPEN_STATE   LOW

#define SERVICE_UUID "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define WRITE_CHARACTERISTIC_UUID "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define NOTIFY_CHARACTERISTIC_UUID "12345678-4321-4321-4321-123456789abc"

#define MIN_SATELLITES 3 // Require at least 3 satellites for location positioning
#define MAX_CONTACTS 5
#define LDR_INTRUSION_THRESHOLD 950  // ~23% full-scale ADC delta; prevents outdoor ambient false triggers

// ==========================================
// HARDWARE INSTANCES & SENSORS
// ==========================================
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

// ==========================================
// EMERGENCY CONTACTS & DISCONNECT SMS
// ==========================================
String ownerPhoneNumber = "";

// Selected/toggled contacts — used for alerts when BLE is CONNECTED
String emergencyContactNumbers[MAX_CONTACTS];
int emergencyContactCount = 0;

// ALL contacts — used for disconnect SMS (regardless of toggle)
String allContactNumbers[MAX_CONTACTS];
int allContactCount = 0;

bool bleEverConnected = false;
bool disconnectSmsPending = false;
bool disconnectSmsSent = false;
int smsSentCount = 0;  // Tracks total SMS messages sent since power-on
// SMS Format Mode: 0 = Combined (1 SMS), 1 = Separate (2 SMS), 2 = Coordinates Only (1 SMS)
int smsFormatMode = 0;
bool alarmWasActiveOnDisconnect = false; // True if alarm was firing when BLE dropped
unsigned long disconnectTimeMs = 0;
const unsigned long DISCONNECT_GRACE_PERIOD_MS = 5000;  // Grace: reconnect within 5s cancels SMS
const unsigned long ALARM_DISCONNECT_GRACE_MS  = 1500;  // Shorter grace when alarm is active

// ==========================================
// ANTI-THEFT & COMMUTE MONITORING STATE
// ==========================================
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
const float BATTERY_ADC_REFERENCE_V = 3.3;
const float BATTERY_DIVIDER_RATIO = 2.0;
const float BATTERY_EMPTY_V = 3.2;
const float BATTERY_FULL_V = 4.2;

unsigned long shakeStartTimeMs = 0;
unsigned long lastValidShakeTimeMs = 0;
bool isShaking = false;

const unsigned long SHAKE_DISMISS_DURATION_MS = 3000;
const unsigned long SHAKE_GAP_ALLOWED_MS = 1500;
const float MOTION_SNATCH_THRESHOLD = 1.8;
const float SHAKE_DISMISS_THRESHOLD = 2.2;  // Lowered from 3.5 for reliable hand-shake detection on wearable

bool deviceConnected = false;
NimBLECharacteristic *pNotifyChar = nullptr;

// ==========================================
// MOTION & BATTERY FUNCTIONS
// ==========================================
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

float readBatteryVoltage() {
  long sampleTotal = 0;
  const int sampleCount = 8;

  for (int i = 0; i < sampleCount; i++) {
    sampleTotal += analogRead(BATTERY_PIN);
    delay(2);
  }

  float rawAverage = sampleTotal / (float)sampleCount;
  float adcVoltage = (rawAverage / 4095.0f) * BATTERY_ADC_REFERENCE_V;
  return adcVoltage * BATTERY_DIVIDER_RATIO;
}

int getBatteryPercent(float voltage) {
  float percent = ((voltage - BATTERY_EMPTY_V) / (BATTERY_FULL_V - BATTERY_EMPTY_V)) * 100.0f;
  if (percent < 0.0f)
    return 0;
  if (percent > 100.0f)
    return 100;
  return (int)(percent + 0.5f);
}

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
  
  // Immediately engage buzzer and vibration on alert trigger
  pulseState = true;
  lastPulseToggleMs = millis();
  if (vibrationEnabled) {
    digitalWrite(MOTOR_PIN, HIGH);
  }
  if (buzzerEnabled) {
    digitalWrite(BUZZER_PIN, HIGH);
  }
  
  Serial.printf("[DESTINATION] Arrival alert active. Buzzer=%d Vib=%d\n", buzzerEnabled, vibrationEnabled);
}

void stopDestinationAlert(bool completed) {
  destinationAlertActive = false;
  destinationAlarmEnabled = false;
  destinationAlarmTriggered = completed;
  destinationAlarmCompleted = completed;
  currentStatus = completed ? "DESTINATION_CONFIRMED" : "SAFE";
  resetShakeState();
  stopOutputs();

  // Auto-rearm anti-theft after commute arrival shake confirmed
  if (completed && antiTheftMonitoringEnabled && systemArmed) {
    Serial.println("[DEST→AT] Arrival confirmed. Re-arming anti-theft with fresh calibration.");
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

  if (isShaking && (currentMillis - lastValidShakeTimeMs > SHAKE_GAP_ALLOWED_MS)) {
    resetShakeState();
    Serial.println("[DEST SHAKE] Hand shake interrupted/timed out.");
  }

  return false;
}

// ==========================================
// GSM & SMS ROUTINES
// ==========================================
String sendAndLogAT(String cmd, unsigned int timeoutMs = 350) {
  Serial.print("[AT CMD] ");
  Serial.println(cmd);

  while (Serial2.available()) Serial2.read();
  Serial2.println(cmd);

  unsigned long start = millis();
  String resp = "";
  while (millis() - start < timeoutMs) {
    while (Serial2.available()) {
      resp += (char)Serial2.read();
    }
    if (resp.indexOf("OK") != -1 || resp.indexOf("ERROR") != -1) break;
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
    Serial.println("[GSM] Modem not responding (offline/unpowered). Skipping verbose diagnostics.");
    Serial.println("=======================================\n");
    return;
  }

  sendAndLogAT("ATE0", 300);                // Turn off echo
  sendAndLogAT("AT+CPIN?", 400);            // Check SIM Ready Status
  sendAndLogAT("AT+CSQ", 300);              // Check Signal Quality
  sendAndLogAT("AT+CREG?", 300);            // Check Network Reg
  sendAndLogAT("AT+CMGF=1", 300);           // Set SMS Text Mode
  sendAndLogAT("AT+CSCS=\"GSM\"", 300);     // Set GSM Charset
  Serial.println("=======================================\n");
}

bool sendSingleSMS(String recipient, String textPayload) {
  if (recipient.length() < 7) {
    Serial.printf("[GSM] Invalid recipient phone number: '%s'\n", recipient.c_str());
    return false;
  }

  Serial2.println("AT+CMGF=1");
  delay(150);

  while (Serial2.available()) Serial2.read();

  Serial2.print("AT+CMGS=\"");
  Serial2.print(recipient);
  Serial2.println("\"");

  unsigned long start = millis();
  bool promptReceived = false;
  while (millis() - start < 4000) {
    if (Serial2.available()) {
      if (Serial2.read() == '>') {
        promptReceived = true;
        break;
      }
    }
  }

  if (!promptReceived) {
    Serial.println("[GSM] Failed to receive SMS prompt '>' from modem.");
    return false;
  }

  delay(200);
  Serial2.print(textPayload);
  delay(300); 
  Serial2.write(26); // Send Ctrl+Z

  start = millis();
  String response = "";
  while (millis() - start < 10000) {
    while (Serial2.available()) {
      response += (char)Serial2.read();
    }
    if (response.indexOf("OK") != -1 || response.indexOf("ERROR") != -1) break;
    yield();
  }

  bool success = (response.indexOf("OK") != -1 || response.indexOf("+CMGS:") != -1);
  if (success) {
    smsSentCount++;
    Serial.printf("[GSM] SMS to %s SENT SUCCESS (total sent: %d)\n", recipient.c_str(), smsSentCount);
  } else {
    Serial.printf("[GSM] SMS to %s FAILED\n", recipient.c_str());
  }
  return success;
}

void sendAlertoLocationSMS(String recipientNumber, float lat, float lng) {
  if (smsFormatMode == 0) {
    // 1. Combined Message (1 SMS)
    Serial.print("\n[ALERTO] Sending COMBINED SMS to: ");
    Serial.println(recipientNumber);
    String msg = "ALERTO Device location acquired!\n\nCoordinates:\n" + String(lat, 6) + ", " + String(lng, 6);
    if (sendSingleSMS(recipientNumber, msg)) {
      Serial.println("[GSM] Combined SMS delivered successfully.");
    } else {
      Serial.println("[GSM FAILED] Combined SMS failed to send.");
    }
  } else if (smsFormatMode == 2) {
    // 3. Coordinates Only (1 SMS)
    Serial.print("\n[ALERTO] Sending COORDINATES ONLY SMS to: ");
    Serial.println(recipientNumber);
    String msg = String(lat, 6) + ", " + String(lng, 6);
    if (sendSingleSMS(recipientNumber, msg)) {
      Serial.println("[GSM] Coordinates Only SMS delivered successfully.");
    } else {
      Serial.println("[GSM FAILED] Coordinates Only SMS failed to send.");
    }
  } else {
    // 2. Separate Messages (2 SMS)
    Serial.print("\n[ALERTO] Initiating 2-Part Separate SMS transmission to: ");
    Serial.println(recipientNumber);

    String msg1 = "ALERTO Device location acquired!\n\nCoordinates will follow in the next text for easy copy-paste into ALERTO App or browser.";
    String msg2 = String(lat, 6) + ", " + String(lng, 6);

    if (sendSingleSMS(recipientNumber, msg1)) {
      Serial.println("[GSM] Part 1/2 delivered successfully.");
    } else {
      Serial.println("[GSM FAILED] Part 1/2 failed to send.");
    }

    delay(2500);

    if (sendSingleSMS(recipientNumber, msg2)) {
      Serial.println("[GSM] Part 2/2 (Coordinates) delivered successfully!");
    } else {
      Serial.println("[GSM FAILED] Part 2/2 failed to send.");
    }
  }
}

// Disconnection Alert: send to ALL contacts (regardless of toggle)
void sendDisconnectionAlertSMS(float lat, float lng, bool alarmActive) {
  String alertType = alarmActive
    ? "ALARM WAS ACTIVE"
    : "Bluetooth Disconnected";

  Serial.printf("\n[ALERTO] Sending Disconnect SMS [%s] to ALL contacts...\n", alertType.c_str());

  String locText = (lat != 0.0 || lng != 0.0)
    ? (String(lat, 6) + ", " + String(lng, 6))
    : "No GPS fix";

  String msg = "ALERTO ALERT!\n" + alertType + "\nDevice last location:\n" + locText;

  // Send to owner
  if (ownerPhoneNumber.length() >= 7) {
    Serial.printf("[GSM] Owner: %s\n", ownerPhoneNumber.c_str());
    sendSingleSMS(ownerPhoneNumber, msg);
    delay(2000);
  }

  // Send to ALL stored contacts
  for (int i = 0; i < allContactCount; i++) {
    if (allContactNumbers[i].length() >= 7 && allContactNumbers[i] != ownerPhoneNumber) {
      Serial.printf("[GSM] All-Contact[%d]: %s\n", i + 1, allContactNumbers[i].c_str());
      sendSingleSMS(allContactNumbers[i], msg);
      delay(2000);
    }
  }
}

void processIncomingGSM() {
  while (Serial2.available()) {
    char c = Serial2.read();
    gsmBuffer += c;
    Serial.write(c); // Live output tracking
  }

  int cmtIndex = gsmBuffer.indexOf("+CMT:");
  if (cmtIndex != -1) {
    String upperBuffer = gsmBuffer;
    upperBuffer.toUpperCase();

    if (upperBuffer.indexOf("WHERE") != -1) {
      int firstQuote = gsmBuffer.indexOf("\"", cmtIndex);
      int secondQuote = gsmBuffer.indexOf("\"", firstQuote + 1);

      if (firstQuote != -1 && secondQuote != -1) {
        String senderNumber = gsmBuffer.substring(firstQuote + 1, secondQuote);
        Serial.print("\n[ALERTO] 'WHERE' command recognized from: ");
        Serial.println(senderNumber);

        sendAlertoLocationSMS(senderNumber, filteredLat, filteredLng);
      }
      gsmBuffer = ""; // Reset buffer after execution
    } 
    else if (gsmBuffer.length() > 300) {
      gsmBuffer = ""; 
    }
  } 
  else if (gsmBuffer.length() > 500) {
    gsmBuffer = ""; // Clear background network noise
  }
}

// ==========================================
// BLE SENSOR DATA TRANSMISSION
// ==========================================
void sendSensorData() {
  if (pNotifyChar == nullptr) return;

  float shakeProgressSec = ((alarmActive || destinationAlertActive) && isShaking)
    ? (float)(millis() - shakeStartTimeMs) / 1000.0
    : 0.0;
  float batteryVoltage = readBatteryVoltage();
  int batteryPercent = getBatteryPercent(batteryVoltage);

  // Ultra-compact JSON payload — all keys ≤4 chars for reliable BLE MTU
  String json = "{";
  json += "\"alm\":" + String((alarmActive || destinationAlertActive) ? 1 : 0) + ",";
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
  json += "\"st\":\"" + currentStatus + "\"";
  json += "}\n";

  if (deviceConnected) {
    pNotifyChar->setValue((const uint8_t *)json.c_str(), json.length());
    pNotifyChar->notify();
    Serial.print("[BLE NOTIFY] ");
    Serial.println(json);
  }
}

// ==========================================
// BLE CALLBACKS & COMMAND HANDLERS
// ==========================================
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
    Serial.printf("[BLE] Disconnected. AlarmActive=%d — grace period starting.\n", alarmWasActiveOnDisconnect ? 1 : 0);
    NimBLEDevice::startAdvertising();
  }
  void onDisconnect(NimBLEServer *pServer, NimBLEConnInfo &connInfo, int reason) {
    deviceConnected = false;
    disconnectTimeMs = millis();
    disconnectSmsPending = true;
    alarmWasActiveOnDisconnect = (alarmActive || destinationAlertActive);
    Serial.printf("[BLE] Disconnected. AlarmActive=%d — grace period starting.\n", alarmWasActiveOnDisconnect ? 1 : 0);
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
    } else if (command == "STOP" || command == "DS" || command == "DESTINATION_STOP" || command == "DEST_STOP") {
      stopDestinationAlert(false);
      clearAntiTheftAlarm("SAFE");
      if (antiTheftMonitoringEnabled && systemArmed) {
        startCalibrationPhase();
      }
      Serial.println("[STOP] Alarm stopped/dismissed from phone.");
    } else if (command == "BUZZER_ON" || command == "BZ:1") {
      buzzerEnabled = true;
      Serial.println("[CONFIG] Buzzer Enabled.");
    } else if (command == "BUZZER_OFF" || command == "BZ:0") {
      buzzerEnabled = false;
      Serial.println("[CONFIG] Buzzer Disabled.");
    } else if (command == "VIBRATION_ON" || command == "VB:1") {
      vibrationEnabled = true;
      Serial.println("[CONFIG] Vibration Enabled.");
    } else if (command == "VIBRATION_OFF" || command == "VB:0") {
      vibrationEnabled = false;
      Serial.println("[CONFIG] Vibration Disabled.");
    } else if (command == "FORCE_SOUND") {
      buzzerEnabled = true;
      vibrationEnabled = true;
      triggerForceSound(millis());
    } else if (command == "SMS:COMBINED" || command == "SMS:0" || command == "SMS_FORMAT:0") {
      smsFormatMode = 0;
      Serial.println("[CONFIG] SMS Format: COMBINED (1 SMS per alert)");
    } else if (command == "SMS:SEPARATE" || command == "SMS:1" || command == "SMS_FORMAT:1") {
      smsFormatMode = 1;
      Serial.println("[CONFIG] SMS Format: SEPARATE (2 SMS per alert)");
    } else if (command == "SMS:COORDS_ONLY" || command == "SMS:COORDS" || command == "SMS:2" || command == "SMS_FORMAT:2") {
      smsFormatMode = 2;
      Serial.println("[CONFIG] SMS Format: COORDINATES ONLY (1 SMS per alert)");
    } else if (command.startsWith("DESTINATION_ALERT") || command.startsWith("DEST_ALERT") || command.startsWith("DA")) {
      // Optional toggle parameters: DA:1,1 or DEST_ALERT:1,0 (buzzer,vibration)
      int colonIdx = command.indexOf(':');
      if (colonIdx > 0) {
        String params = command.substring(colonIdx + 1);
        int commaIdx = params.indexOf(',');
        if (commaIdx > 0) {
          buzzerEnabled = params.substring(0, commaIdx).toInt() == 1;
          vibrationEnabled = params.substring(commaIdx + 1).toInt() == 1;
        }
      }
      startDestinationAlert();
    } else if (command.startsWith("CA:") || command.startsWith("CT:")) {
      // CA: = ALL contacts (for disconnect SMS, regardless of toggle)
      // Format: CA:owner;c1;c2;...
      auto parseContacts = [](String payload, String &ownerOut, String *arr, int &countOut) {
        int s1 = payload.indexOf(';');
        if (s1 != -1) {
          ownerOut = payload.substring(0, s1); ownerOut.trim();
          String rest = payload.substring(s1 + 1);
          countOut = 0;
          while (rest.length() > 0 && countOut < MAX_CONTACTS) {
            int ns = rest.indexOf(';');
            String n = (ns != -1) ? rest.substring(0, ns) : rest;
            n.trim();
            if (n.length() >= 7) arr[countOut++] = n;
            if (ns == -1) break;
            rest = rest.substring(ns + 1);
          }
        } else {
          ownerOut = payload; ownerOut.trim();
          countOut = 0;
        }
      };
      String payload = command.substring(command.indexOf(':') + 1);
      parseContacts(payload, ownerPhoneNumber, allContactNumbers, allContactCount);
      Serial.printf("[CA SYNCED] Owner: %s | All contacts: %d\n", ownerPhoneNumber.c_str(), allContactCount);
    } else if (command.startsWith("CS:")) {
      // CS: = SELECTED contacts (toggled on — used for alarm alerts when BLE is connected)
      // Format: CS:owner;c1;c2;...
      String payload = command.substring(3);
      int s1 = payload.indexOf(';');
      emergencyContactCount = 0;
      if (s1 != -1) {
        String rest = payload.substring(s1 + 1);
        while (rest.length() > 0 && emergencyContactCount < MAX_CONTACTS) {
          int ns = rest.indexOf(';');
          String n = (ns != -1) ? rest.substring(0, ns) : rest;
          n.trim();
          if (n.length() >= 7) emergencyContactNumbers[emergencyContactCount++] = n;
          if (ns == -1) break;
          rest = rest.substring(ns + 1);
        }
      }
      Serial.printf("[CS SYNCED] Selected contacts: %d\n", emergencyContactCount);
    } else if (command.indexOf(',') > 0) {
      configureDestinationAlarm(command);
    }

    sendSensorData();
  }
};

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  delay(100);
  Serial.println("\n=== ANY-SAT GPS + UDR + ALERTO GSM: ESP32-S3 ===");

  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(BATTERY_PIN, INPUT);
  analogReadResolution(12);
  digitalWrite(MOTOR_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);

  // Single short startup chirp
  digitalWrite(BUZZER_PIN, HIGH);
  delay(40);
  digitalWrite(BUZZER_PIN, LOW);

  pinMode(REED_PIN, INPUT_PULLUP);

  // 1. INITIALIZE NIMBLE BLUETOOTH IMMEDIATELY FIRST
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
  pAdvertising->setMinInterval(32); // ~20ms interval
  pAdvertising->setMaxInterval(64); // ~40ms interval
  pAdvertising->start();
  Serial.println("[BLE] Advertising as 'Alerto_Hardware' immediately ready!");

  // 2. INITIALIZE SENSORS & SERIAL PORTS
  gpsSerial.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial2.begin(115200, SERIAL_8N1, GSM_RX_PIN, GSM_TX_PIN);

  // Initialize MPU6050
  Wire.setTimeOut(100);
  Wire.begin(MPU_SDA, MPU_SCL);
  if (!mpu.begin(0x68, &Wire) && !mpu.begin(0x69, &Wire)) {
    Serial.println("[ERROR] MPU6050 Connection Failed on 0x68 & 0x69! Bypassing...");
    mpuFunctional = false;
  } else {
    Serial.println("[OK] MPU6050 Connected successfully!");
    mpuFunctional = true;
    mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
    mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  }

  // 3. QUICK GSM SETUP (Non-blocking)
  runGSMDiagnostics();
  Serial2.println("AT+CMGF=1");
  Serial2.println("AT+CNMI=2,2,0,0,0");

  while (Serial2.available()) Serial2.read();
  gsmBuffer = "";

  Serial.println("\n=== SYSTEM READY: Advertising BLE and active ===");
}

// ==========================================
// MAIN LOOP
// ==========================================
void loop() {
  unsigned long currentMillis = millis();

  sensors_event_t a, g, temp;
  if (mpuFunctional) {
    mpu.getEvent(&a, &g, &temp);
  }

  // 1. INGEST GPS BYTES & UPDATE POSITIONING (Kalman Filter + UDR)
  while (gpsSerial.available() > 0) {
    char c = gpsSerial.read();
    rawBytesReceived++;
    gps.encode(c);
  }

  if (gps.satellites.isValid()) {
    currentSats = gps.satellites.value();
  }

  // Active GPS fix mode — accept any valid fix with age < 5s for freshness
  if (gps.location.isValid() && gps.location.age() < 5000 && currentSats >= MIN_SATELLITES) {
    float rawLat = gps.location.lat();
    float rawLng = gps.location.lng();

    if (!isGpsInitialized) {
      kalmanLat.setInitial(rawLat);
      kalmanLng.setInitial(rawLng);
      isGpsInitialized = true;
      Serial.println("[GPS LOCK ACQUIRED] Baseline initialized!");
    }

    filteredLat = kalmanLat.updateEstimate(rawLat);
    filteredLng = kalmanLng.updateEstimate(rawLng);

    if (currentMillis - lastGpsPrintTime > 2000) {
      Serial.printf("[GPS LOCK] Lat: %.6f, Lng: %.6f | Sats: %d | Accel Z: %.2f m/s²\n",
                    filteredLat, filteredLng, currentSats, mpuFunctional ? a.acceleration.z : 0.0);
      lastGpsPrintTime = currentMillis;
    }
  } 
  // UDR fallback mode when satellite signal is lost
  else if (isGpsInitialized && mpuFunctional) {
    float accelMag = sqrt(a.acceleration.x * a.acceleration.x + 
                          a.acceleration.y * a.acceleration.y + 
                          a.acceleration.z * a.acceleration.z);

    if (accelMag > 1.0 && abs(accelMag - 9.81) > 0.60) { 
      filteredLat += 0.000002;
      filteredLng += 0.000002;

      if (currentMillis - lastGpsPrintTime > 1000) {
        Serial.printf("[UDR STEP] Force: %.2f m/s² | Lat: %.6f, Lng: %.6f\n", accelMag, filteredLat, filteredLng);
        lastGpsPrintTime = currentMillis;
      }
    } else {
      if (currentMillis - lastGpsPrintTime > 1500) {
        Serial.printf("[UDR IDLE] Force: %.2f m/s² | Sats: %d | Lat/Lng: %.6f, %.6f\n",
                      accelMag, currentSats, filteredLat, filteredLng);
        lastGpsPrintTime = currentMillis;
      }
    }
  }
  else {
    if (currentMillis - lastGpsPrintTime > 1500) {
      Serial.printf("Waiting for Valid Fix | Current Sats: %d | Bytes Rx: %lu | Accel Z: %.2f m/s²\n",
                    currentSats, rawBytesReceived, mpuFunctional ? a.acceleration.z : 0.0);
      lastGpsPrintTime = currentMillis;
    }
  }

  // 2. PROCESS INCOMING GSM (Handles 'WHERE' location requests)
  processIncomingGSM();

  // 3. BLUETOOTH DISCONNECTION → GSM SMS AUTO-ALERT
  if (disconnectSmsPending && !deviceConnected && bleEverConnected) {
    // If alarm was firing when phone disconnected, use a shorter grace (1.5s) so SMS fires faster
    unsigned long gracePeriod = alarmWasActiveOnDisconnect ? ALARM_DISCONNECT_GRACE_MS : DISCONNECT_GRACE_PERIOD_MS;
    if (currentMillis - disconnectTimeMs >= gracePeriod && !disconnectSmsSent) {
      disconnectSmsPending = false;
      disconnectSmsSent = true;
      sendDisconnectionAlertSMS(filteredLat, filteredLng, alarmWasActiveOnDisconnect);
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
    if (!alarmActive && !destinationAlertActive) {
      stopOutputs();
    }
  }

  // 5. ANTI-THEFT CALIBRATION PHASE
  if (systemArmed && !calibrated) {
    if (calibrationStartMs == 0) {
      calibrationStartMs = currentMillis;
    }

    currentStatus = "calibrating";
    stopOutputs();

    unsigned long elapsedCal = currentMillis - calibrationStartMs;

    analogRead(LDR_PIN);

    static unsigned long lastCalNotify = 0;
    if (currentMillis - lastCalNotify > 500) {
      sendSensorData();
      lastCalNotify = currentMillis;
    }

    if (elapsedCal >= CALIBRATION_DURATION_MS) {
      baselineLDR = analogRead(LDR_PIN);
      if (mpuFunctional) {
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

    delay(30);
    return;
  }

  // 6. ACTIVE ALARM (ANTI-THEFT) PULSING & SHAKE DISMISS
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
        if (duration >= SHAKE_DISMISS_DURATION_MS) {
          Serial.println("USER DISMISSAL: Target achieved. Entering 3-second calibration reset.");
          startCalibrationPhase();
          sendSensorData();
          return;
        }
      } else {
        if (isShaking && (currentMillis - lastValidShakeTimeMs > SHAKE_GAP_ALLOWED_MS)) {
          resetShakeState();
        }
      }
    }

    static unsigned long lastAlarmNotifyMs = 0;
    if (currentMillis - lastAlarmNotifyMs > 1000) {
      sendSensorData();
      lastAlarmNotifyMs = currentMillis;
    }

    delay(30);
    return;
  }

  // 7. DESTINATION ARRIVAL ALERT PULSING & MPU6050 SHAKE COUNTDOWN
  //    While destination alert is active, anti-theft sensor checks (section 9) are SKIPPED
  //    so shaking the device to confirm arrival does not trigger a false theft alarm.
  if (destinationAlertActive) {
    currentStatus = "DESTINATION_REACHED";
    updateDestinationVibration(currentMillis);

    if (trackShakeToStop(currentMillis, destinationBaselineMotion)) {
      Serial.println("[DESTINATION] Shake duration reached. Arrival confirmed.");
      stopDestinationAlert(true);  // auto-rearms anti-theft inside if enabled
      sendSensorData();
      return;
    }

    static unsigned long lastDestinationUpdate = 0;
    unsigned long updateIntervalMs = isShaking ? 150 : 500;
    if (currentMillis - lastDestinationUpdate > updateIntervalMs) {
      sendSensorData();
      lastDestinationUpdate = currentMillis;
    }

    delay(30);
    return;
  }

  // 7b. AUTONOMOUS GPS-BASED DESTINATION ARRIVAL CHECK
  //     If destination is configured and GPS has a fix, check if we've entered trigger zone
  if (destinationAlarmEnabled && !destinationAlarmTriggered && !destinationAlertActive
      && isGpsInitialized && filteredLat != 0.0 && filteredLng != 0.0
      && destinationLat != 0.0 && destinationLng != 0.0) {
    float dLat = (filteredLat - destinationLat) * 111320.0;
    float dLng = (filteredLng - destinationLng) * 111320.0 * cos(filteredLat * PI / 180.0);
    float distMeters = sqrt(dLat * dLat + dLng * dLng);
    float triggerMeters = triggerDistanceKm * 1000.0;
    if (distMeters <= triggerMeters) {
      Serial.printf("[GPS AUTO] Distance %.0fm <= trigger %.0fm. Starting arrival alert.\n", distMeters, triggerMeters);
      startDestinationAlert();
      sendSensorData();
      return;
    }
  }

  // 8. LOCAL ARMING CHECK
  if (!systemArmed) {
    int reedState = digitalRead(REED_PIN);
    if (antiTheftMonitoringEnabled && reedState == REED_CLOSED_STATE) {
      systemArmed = true;
      startCalibrationPhase();
      Serial.println("[LOCAL ARM] Magnet closed. Starting 3-second calibration...");
      sendSensorData();
    }
    delay(50);
    return;
  }

  // 9. ANTI-THEFT SENSOR ANOMALY CHECKS
  // Reed Switch (Zipper)
  if (enableReed && digitalRead(REED_PIN) == REED_OPEN_STATE) {
    Serial.println("ANOMALY DETECTED: Reed switch open (Zipper opened).");
    alarmActive = true;
    alertType = 1;
    currentStatus = "THEFT_BAG_OPEN";
    pulseState = false;
    lastPulseToggleMs = currentMillis - PULSE_OFF_DURATION_MS;
    sendSensorData();
    return;
  }

  // LDR Light Sensor — threshold raised to prevent outdoor ambient light false alarms
  int currentLDR = analogRead(LDR_PIN);
  if (enableLdr && (abs(currentLDR - baselineLDR) > LDR_INTRUSION_THRESHOLD)) {
    Serial.println("ANOMALY DETECTED: Light intrusion.");
    alarmActive = true;
    alertType = 2;
    currentStatus = "THEFT_LIGHT_INTRUSION";
    pulseState = false;
    lastPulseToggleMs = currentMillis - PULSE_OFF_DURATION_MS;
    sendSensorData();
    return;
  }

  // MPU Motion Snatch
  if (enableMpu && mpuFunctional) {
    float motionScore = readCombinedMotion();

    if (motionScore > MOTION_SNATCH_THRESHOLD) {
      Serial.printf("ANOMALY DETECTED: Motion score %.2f exceeded threshold %.2f!\n",
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

  // Regular periodic sensor update over BLE
  static unsigned long lastUpdate = 0;
  if (currentMillis - lastUpdate > 2000) {
    sendSensorData();
    lastUpdate = currentMillis;
  }

  delay(10);
  yield();
}
