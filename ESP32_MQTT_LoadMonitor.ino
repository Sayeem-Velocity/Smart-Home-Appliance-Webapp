/************************************************************
 * ESP32 Dual AC Load Monitor + Relay + DHT11 with MQTT
 * Integrated with Smart Home Dashboard via MQTT Protocol
 * 
 * MQTT Topics:
 * - Publish: esp32/load1/data, esp32/load2/data, esp32/dht11/data
 * - Subscribe: esp32/relay1/control, esp32/relay2/control, esp32/threshold/update
 ************************************************************/

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

/*************** WiFi CONFIG ******************/
const char* WIFI_SSID = "YOUR_WIFI_SSID";        // Replace with your WiFi SSID
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD"; // Replace with your WiFi password

/*************** MQTT CONFIG ******************/
const char* MQTT_SERVER = "192.168.1.100";  // Replace with your server IP
const int MQTT_PORT = 1883;
const char* MQTT_CLIENT_ID = "ESP32_LoadMonitor";

// MQTT Topics
const char* TOPIC_LOAD1_DATA = "esp32/load1/data";
const char* TOPIC_LOAD2_DATA = "esp32/load2/data";
const char* TOPIC_DHT11_DATA = "esp32/dht11/data";
const char* TOPIC_RELAY1_CONTROL = "esp32/relay1/control";
const char* TOPIC_RELAY2_CONTROL = "esp32/relay2/control";
const char* TOPIC_RELAY1_STATUS = "esp32/relay1/status";
const char* TOPIC_RELAY2_STATUS = "esp32/relay2/status";
const char* TOPIC_THRESHOLD_UPDATE = "esp32/threshold/update";

/*************** PIN CONFIG ******************/
// ---- Circuit 1 (100W) ----
#define CURR1_PIN   32
#define VOLT1_PIN   33
#define RELAY1_PIN  25

// ---- Circuit 2 (8W) ----
#define CURR2_PIN   34
#define VOLT2_PIN   35
#define RELAY2_PIN  26

// ---- DHT11 ----
#define DHT_PIN     23
#define DHTTYPE     DHT11

/*************** ADC CONFIG ******************/
#define ADC_RESOLUTION     4095.0
#define ADC_REF_VOLTAGE    3.3

/*************** AC CONFIG *******************/
#define AC_FREQUENCY        50.0
#define SAMPLES_PER_CYCLE   100
#define NUM_CYCLES          10

/*************** SENSOR CONFIG ***************/
#define CURRENT_SENSITIVITY   0.100   // ACS712-20A

/*************** PER-LOAD CAL FACTORS ********/
// Load 1 (100W bulb)
#define VOLT_CAL_1   440.0
#define CURR_CAL_1   1.00

// Load 2 (8W bulb)
#define VOLT_CAL_2   440.0
#define CURR_CAL_2   0.18

/*************** RELAY THRESHOLDS (can be updated via MQTT) **********/
float POWER_TH_1 = 120.0;
float POWER_TH_2 = 15.0;

/*************** NOISE FILTER ****************/
#define CURRENT_NOISE_THRESHOLD 0.05

/*************** TIMING ***********************/
#define PUBLISH_INTERVAL 2000  // Publish every 2 seconds

/*************** GLOBALS **********************/
float currOffset1, voltOffset1;
float currOffset2, voltOffset2;

bool relay1On = false;
bool relay2On = false;
bool autoMode1 = true;
bool autoMode2 = true;

unsigned long lastPublish = 0;

// WiFi and MQTT clients
WiFiClient espClient;
PubSubClient mqtt(espClient);
DHT dht(DHT_PIN, DHTTYPE);

/*************** UTILITY FUNCTIONS ************/
static inline float adcToVoltage(int adc) {
  return (adc / ADC_RESOLUTION) * ADC_REF_VOLTAGE;
}

/*************** WiFi SETUP *******************/
void setupWiFi() {
  Serial.println("\n🔌 Connecting to WiFi...");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n❌ WiFi connection failed!");
  }
}

/*************** MQTT CALLBACK ****************/
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  Serial.print("📥 Message arrived [");
  Serial.print(topic);
  Serial.println("]");
  
  // Parse JSON payload
  StaticJsonDocument<256> doc;
  DeserializationError error = deserializeJson(doc, payload, length);
  
  if (error) {
    Serial.print("❌ JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }
  
  // Handle relay control messages
  if (strcmp(topic, TOPIC_RELAY1_CONTROL) == 0) {
    bool state = doc["relay_state"];
    relay1On = state;
    digitalWrite(RELAY1_PIN, relay1On ? LOW : HIGH);
    Serial.print("🔌 Relay 1 set to: ");
    Serial.println(relay1On ? "ON" : "OFF");
    publishRelayStatus(1, relay1On);
  }
  else if (strcmp(topic, TOPIC_RELAY2_CONTROL) == 0) {
    bool state = doc["relay_state"];
    relay2On = state;
    digitalWrite(RELAY2_PIN, relay2On ? LOW : HIGH);
    Serial.print("🔌 Relay 2 set to: ");
    Serial.println(relay2On ? "ON" : "OFF");
    publishRelayStatus(2, relay2On);
  }
  // Handle threshold update messages
  else if (strcmp(topic, TOPIC_THRESHOLD_UPDATE) == 0) {
    int loadNum = doc["load_number"];
    float threshold = doc["power_threshold"];
    
    if (loadNum == 1) {
      POWER_TH_1 = threshold;
      Serial.print("⚙️ Load 1 threshold updated to: ");
      Serial.println(POWER_TH_1);
    } else if (loadNum == 2) {
      POWER_TH_2 = threshold;
      Serial.print("⚙️ Load 2 threshold updated to: ");
      Serial.println(POWER_TH_2);
    }
  }
}

/*************** MQTT SETUP *******************/
void setupMQTT() {
  mqtt.setServer(MQTT_SERVER, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
}

void reconnectMQTT() {
  while (!mqtt.connected()) {
    Serial.print("🔄 Attempting MQTT connection...");
    
    if (mqtt.connect(MQTT_CLIENT_ID)) {
      Serial.println(" connected!");
      
      // Subscribe to control topics
      mqtt.subscribe(TOPIC_RELAY1_CONTROL);
      mqtt.subscribe(TOPIC_RELAY2_CONTROL);
      mqtt.subscribe(TOPIC_THRESHOLD_UPDATE);
      
      Serial.println("✅ Subscribed to control topics");
    } else {
      Serial.print(" failed, rc=");
      Serial.print(mqtt.state());
      Serial.println(" retrying in 5 seconds...");
      delay(5000);
    }
  }
}

/*************** CALIBRATION ******************/
float calibrateChannel(int pin) {
  const int samples = 2000;
  float sum = 0;

  for (int i = 0; i < samples; i++) {
    sum += adcToVoltage(analogRead(pin));
    delayMicroseconds(100);
  }
  return sum / samples;
}

/*************** RMS MEASUREMENT **************/
void measureLoad(
  int currPin, int voltPin,
  float currOffset, float voltOffset,
  float &Irms, float &Vrms
) {
  float sumI2 = 0, sumV2 = 0;
  int totalSamples = SAMPLES_PER_CYCLE * NUM_CYCLES;

  float period_us = 1000000.0 / AC_FREQUENCY;
  float delay_us  = period_us / SAMPLES_PER_CYCLE;
  unsigned long start = micros();

  for (int i = 0; i < totalSamples; i++) {
    float vI = adcToVoltage(analogRead(currPin)) - currOffset;
    float vV = adcToVoltage(analogRead(voltPin)) - voltOffset;

    float I = vI / CURRENT_SENSITIVITY;
    float V = vV;

    sumI2 += I * I;
    sumV2 += V * V;

    while ((micros() - start) < (i + 1) * delay_us);
  }

  Irms = sqrt(sumI2 / totalSamples);
  Vrms = sqrt(sumV2 / totalSamples);

  if (Irms < CURRENT_NOISE_THRESHOLD) Irms = 0.0;
}

/*************** MQTT PUBLISH *****************/
void publishLoadData(int loadNum, float V, float I, float P, bool relayState) {
  StaticJsonDocument<128> doc;
  doc["voltage"] = V;
  doc["current"] = I;
  doc["power"] = P;
  doc["relay_state"] = relayState;
  
  char buffer[128];
  serializeJson(doc, buffer);
  
  const char* topic = (loadNum == 1) ? TOPIC_LOAD1_DATA : TOPIC_LOAD2_DATA;
  mqtt.publish(topic, buffer);
}

void publishDHT11Data(float temp, float hum) {
  StaticJsonDocument<64> doc;
  doc["temperature"] = temp;
  doc["humidity"] = hum;
  
  char buffer[64];
  serializeJson(doc, buffer);
  
  mqtt.publish(TOPIC_DHT11_DATA, buffer);
}

void publishRelayStatus(int loadNum, bool state) {
  StaticJsonDocument<32> doc;
  doc["relay_state"] = state;
  
  char buffer[32];
  serializeJson(doc, buffer);
  
  const char* topic = (loadNum == 1) ? TOPIC_RELAY1_STATUS : TOPIC_RELAY2_STATUS;
  mqtt.publish(topic, buffer);
}

/*************** SETUP ************************/
void setup() {
  Serial.begin(115200);
  delay(1000);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  digitalWrite(RELAY1_PIN, HIGH);  // OFF (active LOW)
  digitalWrite(RELAY2_PIN, HIGH);  // OFF (active LOW)

  dht.begin();

  // Connect to WiFi
  setupWiFi();
  
  // Setup MQTT
  setupMQTT();

  Serial.println("\n⚠ Turn OFF AC power for calibration...");
  delay(4000);

  // ---- Independent calibration ----
  currOffset1 = calibrateChannel(CURR1_PIN);
  voltOffset1 = calibrateChannel(VOLT1_PIN);
  currOffset2 = calibrateChannel(CURR2_PIN);
  voltOffset2 = calibrateChannel(VOLT2_PIN);

  Serial.println("✓ Calibration complete\n");
  Serial.println("Turn ON AC power\n");
  Serial.println("📡 Starting MQTT monitoring...\n");
}

/*************** LOOP *************************/
void loop() {
  // Maintain MQTT connection
  if (!mqtt.connected()) {
    reconnectMQTT();
  }
  mqtt.loop();
  
  // Measure loads
  float I1, V1, P1;
  float I2, V2, P2;

  measureLoad(CURR1_PIN, VOLT1_PIN, currOffset1, voltOffset1, I1, V1);
  measureLoad(CURR2_PIN, VOLT2_PIN, currOffset2, voltOffset2, I2, V2);

  // ---- Apply per-load calibration ----
  I1 *= CURR_CAL_1;
  V1 *= VOLT_CAL_1;

  I2 *= CURR_CAL_2;
  V2 *= VOLT_CAL_2;

  P1 = V1 * I1;
  P2 = V2 * I2;

  // ---- Auto Relay Control (if auto mode enabled) ----
  if (autoMode1) {
    bool newState1 = (P1 < POWER_TH_1);
    if (newState1 != relay1On) {
      relay1On = newState1;
      digitalWrite(RELAY1_PIN, relay1On ? LOW : HIGH);
      publishRelayStatus(1, relay1On);
    }
  }
  
  if (autoMode2) {
    bool newState2 = (P2 < POWER_TH_2);
    if (newState2 != relay2On) {
      relay2On = newState2;
      digitalWrite(RELAY2_PIN, relay2On ? LOW : HIGH);
      publishRelayStatus(2, relay2On);
    }
  }

  // ---- DHT11 ----
  float temp = dht.readTemperature();
  float hum  = dht.readHumidity();

  // ---- SERIAL OUTPUT ----
  Serial.println("========= LOAD STATUS =========");

  Serial.print("Load-1 (100W): V=");
  Serial.print(V1,1);
  Serial.print(" I=");
  Serial.print(I1,3);
  Serial.print(" P=");
  Serial.print(P1,1);
  Serial.print("W Relay=");
  Serial.println(relay1On ? "ON" : "OFF");

  Serial.print("Load-2 (8W):  V=");
  Serial.print(V2,1);
  Serial.print(" I=");
  Serial.print(I2,3);
  Serial.print(" P=");
  Serial.print(P2,1);
  Serial.print("W Relay=");
  Serial.println(relay2On ? "ON" : "OFF");

  if (!isnan(temp) && !isnan(hum)) {
    Serial.print("Temp=");
    Serial.print(temp);
    Serial.print("°C  Hum=");
    Serial.print(hum);
    Serial.println("%");
  } else {
    Serial.println("DHT11 read failed");
  }

  Serial.println("===============================\n");

  // ---- Publish to MQTT at intervals ----
  unsigned long now = millis();
  if (now - lastPublish >= PUBLISH_INTERVAL) {
    lastPublish = now;
    
    // Publish load data
    publishLoadData(1, V1, I1, P1, relay1On);
    publishLoadData(2, V2, I2, P2, relay2On);
    
    // Publish DHT11 data if valid
    if (!isnan(temp) && !isnan(hum)) {
      publishDHT11Data(temp, hum);
    }
    
    Serial.println("📤 Data published to MQTT");
  }

  delay(500);  // Small delay between readings
}
