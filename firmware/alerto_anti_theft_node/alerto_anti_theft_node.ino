#pragma GCC optimize("O2")

#include <Wire.h>
#include <math.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <NimBLEDevice.h>

#define REED_PIN 5
#define LDR_PIN 4
#define MPU_SDA 8
#define MPU_SCL 9
#define MOTOR_PIN 10   
#define BUZZER_PIN 11  

#define SERVICE_UUID                "4fafc201-1fb5-459e-8fcc-c5c9c331914b"
#define WRITE_CHARACTERISTIC_UUID   "beb5483e-36e1-4688-b7f5-ea07361b26a8"
#define NOTIFY_CHARACTERISTIC_UUID  "12345678-4321-4321-4321-123456789abc"

Adafruit_MPU6050 mpu;
bool mpuFunctional = false;

bool calibrated = false;
bool alarmActive = false; 
bool systemArmed = false;
String currentStatus = "SAFE";

int alertType = 0;
int baselineLDR = 0;
float baselineMotion = 0;

bool enableReed = true;
bool enableLdr = true;
bool enableMpu = true;
bool buzzerEnabled = true;

bool destinationAlarmEnabled = false;
bool destinationAlarmTriggered = false;
bool destinationAlarmCompleted = false;
bool destinationAlertActive = false;
int sleeperType = 2;
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
const unsigned long SHAKE_GAP_ALLOWED_MS = 1000;      
const float MOTION_THRESHOLD = 10.0; 

bool deviceConnected = false;
NimBLECharacteristic *pNotifyChar = nullptr;

float readMotionMagnitude() {
  if (!mpuFunctional) return 9.8; 
  sensors_event_t a, g, t;
  mpu.getEvent(&a, &g, &t);
  return sqrt(a.acceleration.x * a.acceleration.x +
              a.acceleration.y * a.acceleration.y +
              a.acceleration.z * a.acceleration.z);
}

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

void configureDestinationAlarm(String payload) {
  int idx1 = payload.indexOf(',');
  int idx2 = payload.indexOf(',', idx1 + 1);
  int idx3 = payload.indexOf(',', idx2 + 1);
  int idx4 = payload.indexOf(',', idx3 + 1);
  if (idx1 <= 0 || idx2 <= 0 || idx3 <= 0 || idx4 <= 0) return;

  sleeperType = payload.substring(idx2 + 1, idx3).toInt();
  long requestedShakeSec = payload.substring(idx3 + 1, idx4).toInt();
  wakeShakeSec = requestedShakeSec < 1 ? 1 : (int)requestedShakeSec;
  triggerDistanceKm = payload.substring(idx4 + 1).toFloat();
  destinationAlarmEnabled = true;
  destinationAlarmTriggered = false;
  destinationAlarmCompleted = false;
  destinationAlertActive = false;
  currentStatus = "DESTINATION_SET";
  resetShakeState();
  stopOutputs();
  Serial.printf("[DESTINATION] Configured. Shake=%ds Trigger=%.2fkm\n", wakeShakeSec, triggerDistanceKm);
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
  Serial.println("[DESTINATION] Arrival alert active. Motor only, buzzer off.");
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

  if (sleeperType == 1) {
    onDuration = 180;
    offDuration = 500;
  } else if (sleeperType >= 3) {
    onDuration = 700;
    offDuration = 120;
  }

  if (pulseState) {
    if (currentMillis - lastPulseToggleMs >= (unsigned long)onDuration) {
      digitalWrite(MOTOR_PIN, LOW);
      digitalWrite(BUZZER_PIN, LOW);
      pulseState = false;
      lastPulseToggleMs = currentMillis;
    }
  } else if (currentMillis - lastPulseToggleMs >= (unsigned long)offDuration) {
    digitalWrite(MOTOR_PIN, HIGH);
    digitalWrite(BUZZER_PIN, LOW);
    pulseState = true;
    lastPulseToggleMs = currentMillis;
  }
}

bool trackShakeToStop(unsigned long currentMillis, float baseline) {
  if (!mpuFunctional) return false;
  float currentMotion = readMotionMagnitude();
  bool strongShake = (abs(currentMotion - baseline) > MOTION_THRESHOLD);

  if (strongShake) {
    lastValidShakeTimeMs = currentMillis;

    if (!isShaking) {
      shakeStartTimeMs = currentMillis;
      isShaking = true;
    }

    return currentMillis - shakeStartTimeMs >= ((unsigned long)wakeShakeSec * 1000UL);
  }

  if (isShaking && (currentMillis - lastValidShakeTimeMs > SHAKE_GAP_ALLOWED_MS)) {
    resetShakeState();
  }

  return false;
}

void sendSensorData() {
  if (!deviceConnected || pNotifyChar == nullptr) return;

  float shakeProgressSec = ((alarmActive || destinationAlertActive) && isShaking)
    ? (float)(millis() - shakeStartTimeMs) / 1000.0
    : 0.0;

  String json = "{";
  json += "\"alarmActive\":" + String((alarmActive || destinationAlertActive) ? "true" : "false") + ",";
  json += "\"antiTheftActive\":" + String(alarmActive ? "true" : "false") + ",";
  json += "\"antiTheftType\":" + String(alertType) + ",";
  json += "\"destinationAlarmEnabled\":" + String(destinationAlarmEnabled ? "true" : "false") + ",";
  json += "\"destinationAlarmTriggered\":" + String(destinationAlarmTriggered ? "true" : "false") + ",";
  json += "\"destinationAlarmCompleted\":" + String(destinationAlarmCompleted ? "true" : "false") + ",";
  json += "\"wakeShakeSec\":" + String(wakeShakeSec) + ",";
  json += "\"sleeperType\":" + String(sleeperType) + ",";
  json += "\"shakeProgressSec\":" + String(shakeProgressSec, 2) + ",";
  json += "\"triggerDistanceKm\":" + String(triggerDistanceKm, 2) + ",";
  json += "\"status\":\"" + currentStatus + "\"";
  json += "}";

  pNotifyChar->setValue(json.c_str());
  pNotifyChar->notify();
}

class MyServerCallbacks : public NimBLEServerCallbacks {
  void onConnect(NimBLEServer* pServer) {
    deviceConnected = true;
    Serial.println("[BLE] Phone connected.");
  }

  void onDisconnect(NimBLEServer* pServer) {
    deviceConnected = false;
    Serial.println("[BLE] Phone disconnected. Advertising again.");
    NimBLEDevice::startAdvertising();
  }
};

class MyBLECallbacks : public NimBLECharacteristicCallbacks {
  void onWrite(NimBLECharacteristic *pCharacteristic, NimBLEConnInfo &connInfo) override {
    std::string value = pCharacteristic->getValue();
    String command = String(value.c_str());
    command.trim();
    if (command.length() == 0) return;

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
          enableMpu = config.substring(idx2 + 1).toInt() == 1;
        }
        
        currentStatus = "SAFE";
        Serial.printf("[CONFIG] Reed=%d LDR=%d MPU=%d Buzzer=%d\n", enableReed, enableLdr, enableMpu, buzzerEnabled);
      }
    } else if (command == "AT:ARM") {
      calibrated = false; 
      systemArmed = true;
      currentStatus = "calibrating";
      Serial.println("[ARM] System armed from phone.");
    } else if (command == "AT:DISARM") {
      systemArmed = false;
      alarmActive = false;
      currentStatus = "SAFE";
      alertType = 0;
      digitalWrite(MOTOR_PIN, LOW);
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println("[DISARM] System disarmed from phone.");
    } else if (command == "STOP") {
      alarmActive = false;
      stopDestinationAlert(false);
      currentStatus = "SAFE";
      alertType = 0;
      digitalWrite(MOTOR_PIN, LOW);
      digitalWrite(BUZZER_PIN, LOW);
      Serial.println("[STOP] Alarm stopped/dismissed from phone.");
    } else if (command == "BUZZER_ON") {
      buzzerEnabled = true;
      Serial.println("[CONFIG] Buzzer Enabled.");
    } else if (command == "BUZZER_OFF") {
      buzzerEnabled = false;
      Serial.println("[CONFIG] Buzzer Disabled.");
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

  pinMode(REED_PIN, INPUT);

  Wire.begin(MPU_SDA, MPU_SCL);
  if (!mpu.begin()) {
    Serial.println("[ERROR] MPU6050 Connection Failed! Bypassing to allow boot...");
    mpuFunctional = false;
  } else {
    Serial.println("[OK] MPU6050 Connected successfully!");
    mpuFunctional = true;
  }

  NimBLEDevice::init("Alerto_Hardware");
  NimBLEServer *pServer = NimBLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  NimBLEService *pService = pServer->createService(SERVICE_UUID);
  NimBLECharacteristic *pWriteChar = pService->createCharacteristic(
    WRITE_CHARACTERISTIC_UUID,
    NIMBLE_PROPERTY::WRITE
  );
  pWriteChar->setCallbacks(new MyBLECallbacks());

  pNotifyChar = pService->createCharacteristic(
    NOTIFY_CHARACTERISTIC_UUID,
    NIMBLE_PROPERTY::NOTIFY
  );

  pService->start();
  NimBLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  NimBLEDevice::getAdvertising()->start();
  Serial.println("[BLE] Advertising as 'Alerto_Hardware'...");

  Serial.println("SYSTEM INFO: Allowing 5 seconds to stabilize before baseline calibration...");
  delay(5000); 
}

void loop() {
  unsigned long currentMillis = millis();

  if (systemArmed && !calibrated) {
    Serial.println("SYSTEM INFO: Calibrating baselines... Keep unit still.");
    
    analogRead(LDR_PIN);
    if (mpuFunctional) {
      sensors_event_t a, g, t;
      mpu.getEvent(&a, &g, &t);
    }
    delay(200);

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
                          
    isShaking = false;
    shakeStartTimeMs = 0;
    pulseState = false;
    calibrated = true;
    currentStatus = "armed";
    
    Serial.print("   -> Baseline LDR: "); Serial.println(baselineLDR);
    Serial.print("   -> Baseline Motion: "); Serial.println(baselineMotion);
    Serial.print("   -> Reed Switch Status: "); 
    if (digitalRead(REED_PIN) == HIGH) {
      Serial.println("CLOSED (Magnet Present - Secured)");
    } else {
      Serial.println("OPEN (No Magnet - Unsecured)");
    }
    Serial.println("SYSTEM STATUS: Active monitoring engaged.");
    sendSensorData();
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
        digitalWrite(MOTOR_PIN, HIGH);
        if (buzzerEnabled) {
          digitalWrite(BUZZER_PIN, HIGH);
        }
        pulseState = true;
        lastPulseToggleMs = currentMillis;
      }
    }
    
    if (pulseState == false && mpuFunctional) {
      sensors_event_t a, g, t;
      mpu.getEvent(&a, &g, &t);
      float currentMotion = sqrt(a.acceleration.x * a.acceleration.x +
                                 a.acceleration.y * a.acceleration.y +
                                 a.acceleration.z * a.acceleration.z);
      
      bool strongShake = (abs(currentMotion - baselineMotion) > MOTION_THRESHOLD);

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
          Serial.println("USER DISMISSAL: Target achieved. Terminating alert processes.");
          
          digitalWrite(MOTOR_PIN, LOW);
          digitalWrite(BUZZER_PIN, LOW);
          alarmActive = false;
          alertType = 0;
          currentStatus = "SAFE";
          sendSensorData();
          
          Serial.println("\n==================================================");
          Serial.println("SYSTEM INFO: Entering 3-second positioning cooldown...");
          Serial.println("==================================================");
          
          for (int countdown = 3; countdown > 0; countdown--) {
            Serial.print("   -> Resetting in: "); Serial.print(countdown); Serial.println("s");
            delay(1000); 
          }
          
          calibrated = false; 
          currentStatus = "calibrating";
          return;
        }
      } else {
        if (isShaking && (currentMillis - lastValidShakeTimeMs > SHAKE_GAP_ALLOWED_MS)) {
          Serial.println("USER DISMISSAL: Timeout window breached. Resetting timeline parameters.");
          isShaking = false;
        }
      }
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
    if (reedState == HIGH) { 
      calibrated = false;
      systemArmed = true;
      currentStatus = "calibrating";
      Serial.println("[LOCAL ARM] Magnet closed. Calibrating...");
      sendSensorData();
    }
    delay(100);
    return;
  }

  if (enableReed && digitalRead(REED_PIN) == LOW) { 
    Serial.println("ANOMALY DETECTED: Reed switch open (Magnet removed).");
    alarmActive = true;
    alertType = 1;
    currentStatus = "THEFT_BAG_OPEN";
    pulseState = false; 
    lastPulseToggleMs = currentMillis - PULSE_OFF_DURATION_MS; 
    sendSensorData();
    return;
  }

  int currentLDR = analogRead(LDR_PIN);
  if (enableLdr && ((currentLDR - baselineLDR) > 600)) { 
    Serial.println("ANOMALY DETECTED: Light intrusion.");
    alarmActive = true;
    alertType = 2;
    currentStatus = "THEFT_LIGHT_INTRUSION";
    pulseState = false;
    lastPulseToggleMs = currentMillis - PULSE_OFF_DURATION_MS;
    sendSensorData();
    return;
  }

  if (enableMpu && mpuFunctional) {
    sensors_event_t a, g, t;
    mpu.getEvent(&a, &g, &t);
    float currentMotion = sqrt(a.acceleration.x * a.acceleration.x +
                               a.acceleration.y * a.acceleration.y +
                               a.acceleration.z * a.acceleration.z);

    if (abs(currentMotion - baselineMotion) > MOTION_THRESHOLD) {
      Serial.println("ANOMALY DETECTED: Motion threshold breached.");
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
    sendSensorData();
    lastUpdate = currentMillis;
  }

  delay(100);
}
