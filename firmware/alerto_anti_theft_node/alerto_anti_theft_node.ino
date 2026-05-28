#pragma GCC optimize("O2")

#include <Wire.h>
#include <math.h>
#include <WiFi.h>
#include <esp_now.h>
#include <esp_wifi.h>
#include <NimBLEDevice.h>
#include <MPU6050.h>

#define REED_PIN 5
#define LDR_PIN 4
#define MPU_SDA 8
#define MPU_SCL 9

#define BAG_OPEN 1
#define LIGHT_INTRUSION 2
#define MOTION_ALERT 3

#define CMD_MAGIC 0xA7
#define CMD_CONFIG 101
#define CMD_ARM 102
#define CMD_DISARM 103

#define SERVICE_UUID "12345678-1234-1234-1234-1234567890ab"

uint8_t wearableMAC[] = {0xB0, 0xCB, 0xD8, 0xC0, 0x3E, 0x44};

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

AlertMessage data;
MPU6050 mpu;

bool systemArmed = false;
bool mpuFunctional = false;
bool enableReed = true;
bool enableLdr = true;
bool enableMpu = true;

int baselineLDR = 0;
float baselineMotion = 0;

void sendAlert(int type, int ldr, float motion) {
  data.alertType = type;
  data.ldrValue = ldr;
  data.motionValue = motion;

  esp_err_t result = esp_now_send(wearableMAC, (uint8_t*)&data, sizeof(data));
  Serial.println(result == ESP_OK ? "[ESP-NOW] Alert sent to wearable." : "[ESP-NOW] Alert send failed.");
}

void calibrateBaselines() {
  Serial.println("[ARM] Calibrating anti-theft baselines...");
  delay(2000);

  baselineLDR = analogRead(LDR_PIN);

  float sum = 0;
  int16_t ax, ay, az, gx, gy, gz;

  for (int i = 0; i < 20; i++) {
    if (mpuFunctional) {
      mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
      sum += sqrt((float)ax * ax + (float)ay * ay + (float)az * az);
    }
    delay(20);
  }

  baselineMotion = mpuFunctional ? (sum / 20.0) : 17000.0;
  systemArmed = true;

  Serial.printf("[ARMED] LDR base=%d Motion base=%.2f Reed=%d LDR=%d MPU=%d\n",
                baselineLDR, baselineMotion, enableReed, enableLdr, enableMpu);
}

void disarmSystem() {
  systemArmed = false;
  Serial.println("[DISARMED] Anti-theft monitoring stopped.");
}

void onCommandRecv(const uint8_t *mac, const uint8_t *incomingData, int len) {
  if (len != sizeof(AntiTheftCommand)) return;

  AntiTheftCommand command;
  memcpy(&command, incomingData, sizeof(command));
  if (command.magic != CMD_MAGIC) return;

  if (command.command == CMD_CONFIG) {
    enableReed = command.enableReed == 1;
    enableLdr = command.enableLdr == 1;
    enableMpu = command.enableMpu == 1;
    Serial.printf("[CONFIG] Reed=%d LDR=%d MPU=%d\n", enableReed, enableLdr, enableMpu);
  } else if (command.command == CMD_ARM) {
    calibrateBaselines();
  } else if (command.command == CMD_DISARM) {
    disarmSystem();
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("========== ALERTO ANTI-THEFT NODE BOOTING ==========");
  pinMode(REED_PIN, INPUT_PULLUP);

  Wire.begin(MPU_SDA, MPU_SCL);
  mpu.initialize();
  mpuFunctional = mpu.testConnection();
  Serial.printf("MPU6050: %s\n", mpuFunctional ? "CONNECTED" : "FAILED/BYPASSED");

  NimBLEDevice::init("ALERTO_BAG_TAG");
  NimBLEServer *server = NimBLEDevice::createServer();
  NimBLEService *service = server->createService(SERVICE_UUID);
  service->start();
  NimBLEDevice::getAdvertising()->addServiceUUID(SERVICE_UUID);
  NimBLEDevice::getAdvertising()->start();

  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  esp_wifi_set_channel(1, WIFI_SECOND_CHAN_NONE);

  if (esp_now_init() == ESP_OK) {
    esp_now_peer_info_t peer{};
    memcpy(peer.peer_addr, wearableMAC, 6);
    peer.channel = 1;
    peer.encrypt = false;
    esp_now_add_peer(&peer);
    esp_now_register_recv_cb(esp_now_recv_cb_t(onCommandRecv));
    Serial.println("[RADIO] ESP-NOW alert sender and command receiver ready on channel 1.");
  }

  Serial.println("[READY] Close reed switch to arm locally, or arm from the app through the wearable.");
}

void loop() {
  unsigned long now = millis();
  int reedState = digitalRead(REED_PIN);
  int currentLDR = analogRead(LDR_PIN);
  float currentMotion = 0.0;

  if (mpuFunctional) {
    int16_t ax, ay, az, gx, gy, gz;
    mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
    currentMotion = sqrt((float)ax * ax + (float)ay * ay + (float)az * az);
  }

  static unsigned long lastLogTime = 0;
  if (now - lastLogTime > 2000) {
    Serial.printf("[DEBUG BAG] Armed=%s Reed=%s LDR=%d/%d Motion=%.1f/%.1f Enables=%d,%d,%d\n",
                  systemArmed ? "YES" : "NO",
                  reedState == LOW ? "CLOSED" : "OPEN",
                  currentLDR, baselineLDR, currentMotion, baselineMotion,
                  enableReed, enableLdr, enableMpu);
    lastLogTime = now;
  }

  if (!systemArmed) {
    if (reedState == LOW) {
      calibrateBaselines();
    }
    delay(50);
    return;
  }

  if (enableReed && digitalRead(REED_PIN) == HIGH) {
    Serial.println("[BREACH] Reed switch opened.");
    sendAlert(BAG_OPEN, currentLDR, 0);
    systemArmed = false;
  } else if (enableLdr && (currentLDR - baselineLDR) > 500) {
    Serial.println("[BREACH] Light intrusion detected.");
    sendAlert(LIGHT_INTRUSION, currentLDR, 0);
    systemArmed = false;
  } else if (enableMpu && mpuFunctional && (abs(currentMotion - baselineMotion) > 6000.0)) {
    Serial.println("[BREACH] Motion intrusion detected.");
    sendAlert(MOTION_ALERT, 0, currentMotion);
    systemArmed = false;
  }

  delay(50);
}
