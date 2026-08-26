#pragma GCC optimize("O2")

#include <Wire.h>
#include <math.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <NimBLEDevice.h>
#include <MPU6050.h>

#define SERVICE_UUID                "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define WRITE_CHARACTERISTIC_UUID   "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define NOTIFY_CHARACTERISTIC_UUID  "12345678-4321-4321-4321-123456789abc"

#define MOTOR_PIN 25
#define BUZZER_PIN 2
#define WAKE_THRESHOLD 24000
#define SHAKE_GAP_ALLOWED 1000UL

#define CMD_MAGIC 0xA7
#define CMD_CONFIG 101
#define CMD_ARM 102
#define CMD_DISARM 103

uint8_t antiTheftBroadcastMAC[] = {0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF};

MPU6050 mpu;
NimBLECharacteristic *writeCharacteristic;
NimBLECharacteristic *notifyCharacteristic;
bool deviceConnected = false;

double destLat = 0.0;
double destLng = 0.0;
int sleeperType = 2;
int wakeShakeSec = 3;
float triggerDistanceKm = 1.0;

bool buzzerEnabled = true;
bool vibrationEnabled = true;

bool settingsReceived = false;
bool destinationAlarmEnabled = false;
bool destinationAlarmTriggered = false;
bool destinationAlarmCompleted = false;
bool stopLatched = false;
unsigned long settingsReceivedAtMs = 0;

bool antiTheftAlarmActive = false;
int antiTheftAlertType = 0;
int lastIncomingLdrValue = 0;
float lastIncomingMotionValue = 0.0;
bool antiTheftReedEnabled = true;
bool antiTheftLdrEnabled = true;
bool antiTheftMpuEnabled = true;

bool mpuFunctional = false;
unsigned long lastShakeTime = 0;
unsigned long shakeStartTime = 0;
bool isShaking = false;
unsigned long lastVibeToggle = 0;
bool vibeState = false;

int heartRate = 78;
int spo2 = 98;
bool snoring = false;
bool fallDetected = false;
bool alarmActive = false;
String status = "SAFE";
double currentLat = 14.5995;
double currentLng = 120.9842;

typedef struct {
  int alertType;
  int ldrValue;
  float motionValue;
} AlertMessage;

typedef struct {
  uint8_t magic;
  uint8_t command;
  uint8_t enableReed;
  uint8_t enableLdr;
  uint8_t enableMpu;
} AntiTheftCommand;

AlertMessage incomingDataPacket;

void sendSensorData();
void motorON() { if (vibrationEnabled) digitalWrite(MOTOR_PIN, HIGH); }
void motorOFF() { digitalWrite(MOTOR_PIN, LOW); }
void buzzerON() { if (buzzerEnabled) digitalWrite(BUZZER_PIN, HIGH); }
void buzzerOFF() { digitalWrite(BUZZER_PIN, LOW); }

void forceMotorOff() {
  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(MOTOR_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  vibeState = false;
  lastVibeToggle = 0;
}

void resetShakeState() {
  lastShakeTime = 0;
  shakeStartTime = 0;
  isShaking = false;
}

void sendAntiTheftCommand(uint8_t command) {
  AntiTheftCommand packet;
  packet.magic = CMD_MAGIC;
  packet.command = command;
  packet.enableReed = antiTheftReedEnabled ? 1 : 0;
  packet.enableLdr = antiTheftLdrEnabled ? 1 : 0;
  packet.enableMpu = antiTheftMpuEnabled ? 1 : 0;

  esp_err_t result = esp_now_send(antiTheftBroadcastMAC, (uint8_t*)&packet, sizeof(packet));
  Serial.println(result == ESP_OK ? "[ESP-NOW] Anti-theft command broadcast." : "[ESP-NOW] Anti-theft command failed.");
}

void autoResetToReadyState() {
  alarmActive = false;
  destinationAlarmTriggered = false;
  destinationAlarmCompleted = true;
  antiTheftAlarmActive = false;
  antiTheftAlertType = 0;
  stopLatched = false;
  status = "WAKE_SHAKE_DONE";
  resetShakeState();
  forceMotorOff();
  sendSensorData();
}

void forceStopAllAlerts() {
  alarmActive = false;
  fallDetected = false;
  snoring = false;
  settingsReceived = false;
  destinationAlarmEnabled = false;
  destinationAlarmTriggered = false;
  destinationAlarmCompleted = false;
  antiTheftAlarmActive = false;
  antiTheftAlertType = 0;
  stopLatched = true;
  status = "STOPPED_BY_APP";
  resetShakeState();
  forceMotorOff();
}

void armNewAlarmCycle() {
  settingsReceived = true;
  destinationAlarmEnabled = true;
  destinationAlarmTriggered = false;
  destinationAlarmCompleted = false;
  stopLatched = false;
  settingsReceivedAtMs = millis();
  alarmActive = false;
  status = "DESTINATION_SET";
  resetShakeState();
  forceMotorOff();
}

void updateVibrationPulsing() {
  unsigned long now = millis();
  int onTime = antiTheftAlarmActive ? 100 : 400;
  int offTime = antiTheftAlarmActive ? 80 : 300;

  if (!antiTheftAlarmActive) {
    if (sleeperType == 1) {
      onTime = 180;
      offTime = 500;
    } else if (sleeperType >= 3) {
      onTime = 700;
      offTime = 120;
    }
  }

  if (vibeState) {
    if (now - lastVibeToggle >= (unsigned long)onTime) {
      vibeState = false;
      motorOFF();
      buzzerOFF();
      lastVibeToggle = now;
    }
  } else if (now - lastVibeToggle >= (unsigned long)offTime) {
    vibeState = true;
    motorON();
    buzzerON();
    lastVibeToggle = now;
  }
}

void OnDataRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
  if (len != sizeof(incomingDataPacket)) return;
  memcpy(&incomingDataPacket, incomingData, sizeof(incomingDataPacket));

  if (!stopLatched && incomingDataPacket.alertType >= 1 && incomingDataPacket.alertType <= 3) {
    antiTheftAlarmActive = true;
    antiTheftAlertType = incomingDataPacket.alertType;
    lastIncomingLdrValue = incomingDataPacket.ldrValue;
    lastIncomingMotionValue = incomingDataPacket.motionValue;

    if (antiTheftAlertType == 1) status = "THEFT_BAG_OPEN";
    else if (antiTheftAlertType == 2) status = "THEFT_LIGHT_INTRUSION";
    else if (antiTheftAlertType == 3) status = "THEFT_MOTION_ALERT";

    resetShakeState();
    forceMotorOff();
    sendSensorData();
  }
}

float getMagnitude(int16_t ax, int16_t ay, int16_t az) {
  return sqrt((float)ax * ax + (float)ay * ay + (float)az * az);
}

double toRadians(double deg) {
  return deg * 3.141592653589793 / 180.0;
}

double calculateDistanceKm(double lat1, double lon1, double lat2, double lon2) {
  const double R = 6371.0;
  double dLat = toRadians(lat2 - lat1);
  double dLon = toRadians(lon2 - lon1);
  double a = sin(dLat / 2) * sin(dLat / 2) +
             cos(toRadians(lat1)) * cos(toRadians(lat2)) *
             sin(dLon / 2) * sin(dLon / 2);
  return R * 2 * atan2(sqrt(a), sqrt(1 - a));
}

bool parseSettingsPayload(String payload) {
  payload.trim();
  int idx1 = payload.indexOf(',');
  int idx2 = payload.indexOf(',', idx1 + 1);
  int idx3 = payload.indexOf(',', idx2 + 1);
  int idx4 = payload.indexOf(',', idx3 + 1);
  if (idx1 <= 0 || idx2 <= 0 || idx3 <= 0 || idx4 <= 0) return false;

  destLat = payload.substring(0, idx1).toDouble();
  destLng = payload.substring(idx1 + 1, idx2).toDouble();
  sleeperType = payload.substring(idx2 + 1, idx3).toInt();
  wakeShakeSec = payload.substring(idx3 + 1, idx4).toInt();
  triggerDistanceKm = payload.substring(idx4 + 1).toFloat();
  armNewAlarmCycle();
  return true;
}

bool parseAntiTheftCommand(String payload) {
  payload.trim();

  if (payload.startsWith("AT:CONFIG:")) {
    String config = payload.substring(10);
    int idx1 = config.indexOf(',');
    int idx2 = config.indexOf(',', idx1 + 1);
    if (idx1 <= 0 || idx2 <= 0) return false;

    antiTheftReedEnabled = config.substring(0, idx1).toInt() == 1;
    antiTheftLdrEnabled = config.substring(idx1 + 1, idx2).toInt() == 1;
    antiTheftMpuEnabled = config.substring(idx2 + 1).toInt() == 1;
    status = "ANTI_THEFT_CONFIGURED";
    sendAntiTheftCommand(CMD_CONFIG);
    return true;
  }

  if (payload == "AT:ARM") {
    antiTheftAlarmActive = false;
    antiTheftAlertType = 0;
    stopLatched = false;
    status = "ANTI_THEFT_ARMED";
    sendAntiTheftCommand(CMD_ARM);
    return true;
  }

  if (payload == "AT:DISARM") {
    antiTheftAlarmActive = false;
    antiTheftAlertType = 0;
    status = "ANTI_THEFT_DISARMED";
    sendAntiTheftCommand(CMD_DISARM);
    return true;
  }

  return false;
}

class MyServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer) {
    deviceConnected = true;
    Serial.println("[BLE] App connected.");
  }

  void onDisconnect(NimBLEServer* pServer) {
    deviceConnected = false;
    Serial.println("[BLE] App disconnected. Advertising again.");
    NimBLEDevice::startAdvertising();
  }
};

class MyWriteCallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic, NimBLEConnInfo &connInfo) override {
    std::string value = pCharacteristic->getValue();
    String payload = String(value.c_str());
    payload.trim();
    if (payload.length() == 0) return;

    Serial.print("[BLE Command] Received: ");
    Serial.println(payload);

    if (payload.equalsIgnoreCase("STOP") || payload.equalsIgnoreCase("DESTINATION_STOP")) {
      forceStopAllAlerts();
      sendSensorData();
      return;
    }

    if (payload.equalsIgnoreCase("DESTINATION_ALERT")) {
      if (settingsReceived || destinationAlarmEnabled) {
        destinationAlarmTriggered = true;
        destinationAlarmCompleted = false;
        alarmActive = true;
        status = "DESTINATION_REACHED";
        resetShakeState();
        forceMotorOff();
        sendSensorData();
      }
      return;
    }

    if (payload.equalsIgnoreCase("BUZZER_ON")) {
      buzzerEnabled = true;
      sendSensorData();
      return;
    }

    if (payload.equalsIgnoreCase("BUZZER_OFF")) {
      buzzerEnabled = false;
      buzzerOFF();
      sendSensorData();
      return;
    }

    if (payload.equalsIgnoreCase("VIBRATION_ON")) {
      vibrationEnabled = true;
      sendSensorData();
      return;
    }

    if (payload.equalsIgnoreCase("VIBRATION_OFF")) {
      vibrationEnabled = false;
      motorOFF();
      sendSensorData();
      return;
    }

    if (parseAntiTheftCommand(payload) || parseSettingsPayload(payload)) {
      sendSensorData();
    }
  }
};

void sendSensorData() {
  if (!deviceConnected) return;

  double distanceToDestinationKm =
    (settingsReceived || destinationAlarmTriggered || stopLatched || antiTheftAlarmActive)
      ? calculateDistanceKm(currentLat, currentLng, destLat, destLng)
      : -1.0;
  float shakeProgressSec = (alarmActive && isShaking) ? (float)(millis() - shakeStartTime) / 1000.0 : 0.0;

  String json = "{";
  json += "\"alarmActive\":" + String(alarmActive ? "true" : "false") + ",";
  json += "\"alarm\":" + String(alarmActive ? "true" : "false") + ",";
  json += "\"heartRate\":" + String(heartRate) + ",";
  json += "\"spo2\":" + String(spo2) + ",";
  json += "\"snoring\":" + String(snoring ? "true" : "false") + ",";
  json += "\"fallDetected\":" + String(fallDetected ? "true" : "false") + ",";
  json += "\"latitude\":" + String(currentLat, 6) + ",";
  json += "\"longitude\":" + String(currentLng, 6) + ",";
  json += "\"destLat\":" + String(destLat, 6) + ",";
  json += "\"destLng\":" + String(destLng, 6) + ",";
  json += "\"triggerDistanceKm\":" + String(triggerDistanceKm, 2) + ",";
  json += "\"triggerDist\":" + String(triggerDistanceKm, 2) + ",";
  json += "\"distanceToDestinationKm\":" + String(distanceToDestinationKm, 2) + ",";
  json += "\"wakeShakeSec\":" + String(wakeShakeSec) + ",";
  json += "\"shakeSec\":" + String(wakeShakeSec) + ",";
  json += "\"sleeperType\":" + String(sleeperType) + ",";
  json += "\"sleepType\":" + String(sleeperType) + ",";
  json += "\"shakeProgressSec\":" + String(shakeProgressSec, 2) + ",";
  json += "\"shakeProgress\":" + String(shakeProgressSec, 2) + ",";
  json += "\"settingsReceived\":" + String(settingsReceived ? "true" : "false") + ",";
  json += "\"destinationAlarmEnabled\":" + String(destinationAlarmEnabled ? "true" : "false") + ",";
  json += "\"destEnabled\":" + String(destinationAlarmEnabled ? "true" : "false") + ",";
  json += "\"destinationAlarmTriggered\":" + String(destinationAlarmTriggered ? "true" : "false") + ",";
  json += "\"destTriggered\":" + String(destinationAlarmTriggered ? "true" : "false") + ",";
  json += "\"destinationAlarmCompleted\":" + String(destinationAlarmCompleted ? "true" : "false") + ",";
  json += "\"destCompleted\":" + String(destinationAlarmCompleted ? "true" : "false") + ",";
  json += "\"stopLatched\":" + String(stopLatched ? "true" : "false") + ",";
  json += "\"antiTheftActive\":" + String(antiTheftAlarmActive ? "true" : "false") + ",";
  json += "\"atActive\":" + String(antiTheftAlarmActive ? "true" : "false") + ",";
  json += "\"antiTheftType\":" + String(antiTheftAlertType) + ",";
  json += "\"atType\":" + String(antiTheftAlertType) + ",";
  json += "\"status\":\"" + status + "\"";
  json += "}";

  notifyCharacteristic->setValue(json.c_str());
  notifyCharacteristic->notify();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("\n\n================================================");
  Serial.println("     ALERTO WEARABLE GATEWAY BOOTING...        ");
  Serial.println("================================================");

  pinMode(MOTOR_PIN, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(MOTOR_PIN, LOW);
  digitalWrite(BUZZER_PIN, LOW);
  forceMotorOff();

  // 1. MPU6050 with I2C timeout protection so it never freezes boot
  Wire.begin(26, 27);
  Wire.setTimeOut(50);

  // Probe I2C address 0x68 before calling initialize
  Wire.beginTransmission(0x68);
  byte i2cError = Wire.endTransmission();
  if (i2cError == 0) {
    mpu.initialize();
    mpuFunctional = mpu.testConnection();
    Serial.println(mpuFunctional ? "[MPU] Connected at 0x68." : "[MPU] Present but testConnection failed.");
  } else {
    mpuFunctional = false;
    Serial.printf("[MPU] Not detected on I2C (error code %d). Gesture engine bypassed.\n", i2cError);
  }

  // 2. BLE FIRST — NimBLE must own the radio before Wi-Fi touches it
  NimBLEDevice::init("Alerto_Hardware");
  NimBLEServer *pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  NimBLEService *pService = pServer->createService(SERVICE_UUID);
  writeCharacteristic = pService->createCharacteristic(WRITE_CHARACTERISTIC_UUID, NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::WRITE);
  writeCharacteristic->setCallbacks(new MyWriteCallbacks());

  notifyCharacteristic = pService->createCharacteristic(NOTIFY_CHARACTERISTIC_UUID, NIMBLE_PROPERTY::NOTIFY);
  pService->start();

  NimBLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  NimBLEDevice::getAdvertising()->start();
  Serial.println("[BLE] Advertising as 'Alerto_Hardware'.");

  // 3. Wi-Fi + ESP-NOW AFTER BLE is fully started
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);

  if (esp_now_init() == ESP_OK) {
    esp_now_register_recv_cb(esp_now_recv_cb_t(OnDataRecv));
    esp_now_peer_info_t peer{};
    memcpy(peer.peer_addr, antiTheftBroadcastMAC, 6);
    peer.channel = 1;
    peer.encrypt = false;
    esp_now_add_peer(&peer);
    Serial.println("[ESP-NOW] Anti-theft relay ready on CH1.");
  }

  Serial.println("========== ALERTO WEARABLE GATEWAY ACTIVE ==========");
}

void loop() {
  unsigned long now = millis();
  int16_t ax = 0, ay = 0, az = 0, gx = 0, gy = 0, gz = 0;

  if (mpuFunctional) {
    mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
  }

  float magnitude = getMagnitude(ax, ay, az);
  bool strongShake = (magnitude > WAKE_THRESHOLD);

  if (stopLatched) {
    alarmActive = false;
    fallDetected = false;
    snoring = false;
    status = "STOPPED_BY_APP";
    forceMotorOff();
  } else if (antiTheftAlarmActive) {
    alarmActive = true;
    updateVibrationPulsing();

    if (strongShake && mpuFunctional) {
      lastShakeTime = now;
      if (!isShaking) {
        shakeStartTime = now;
        isShaking = true;
      }
      if (now - shakeStartTime >= ((unsigned long)wakeShakeSec * 1000UL)) {
        autoResetToReadyState();
      }
    } else if (isShaking && (now - lastShakeTime > SHAKE_GAP_ALLOWED)) {
      resetShakeState();
    }
  } else if (settingsReceived && destinationAlarmEnabled && destinationAlarmTriggered) {
    // Commute Arrival Wake-up Active: buzz/vibrate according to user settings
    alarmActive = true;
    status = "DESTINATION_REACHED";
    updateVibrationPulsing();

    // User shaking device to stop the commute alarm
    if (strongShake && mpuFunctional) {
      lastShakeTime = now;
      if (!isShaking) {
        shakeStartTime = now;
        isShaking = true;
      }
      if (now - shakeStartTime >= ((unsigned long)wakeShakeSec * 1000UL)) {
        autoResetToReadyState();
      }
    } else if (isShaking && (now - lastShakeTime > SHAKE_GAP_ALLOWED)) {
      resetShakeState();
    }
    fallDetected = false;
  } else if (settingsReceived && destinationAlarmEnabled) {
    // Active commute monitoring in progress: waiting for destination trigger zone
    // Vehicle motion MUST NOT cause vibration or buzz here
    alarmActive = false;
    status = "WAITING_DESTINATION_TRIGGER";
    forceMotorOff();
  } else {
    // Normal idle state - safe
    alarmActive = false;
    status = "SAFE";
    forceMotorOff();
  }

  static unsigned long lastSend = 0;
  if (now - lastSend > 1000) {
    sendSensorData();
    lastSend = now;
  }
  delay(20);
}
