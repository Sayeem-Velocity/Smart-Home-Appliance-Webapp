/************************************************************
 * ESP32 DUAL AC LOAD MONITOR + MQTT
 * Two independent AC measurement circuits
 * Stabilized RMS readings + DHT11
 * WiFi + MQTT for real-time dashboard communication
 ************************************************************/

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

/*************** WiFi CONFIG ****************/
const char* WIFI_SSID = "CUET Student TP";
const char* WIFI_PASSWORD = "1020304050";

/*************** MQTT CONFIG ****************/
const char* MQTT_BROKER = "192.168.0.182";  // Your PC IP address
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

/*************** WiFi & MQTT Objects ****************/
WiFiClient espClient;
PubSubClient mqttClient(espClient);

/*************** PIN CONFIG ****************/
#define CURRENT1_PIN 32
#define VOLTAGE1_PIN 33
#define RELAY1_PIN   25

#define CURRENT2_PIN 34
#define VOLTAGE2_PIN 35
#define RELAY2_PIN   26

#define DHT_PIN      27   // ✅ Verified working pin

/*************** DHT CONFIG ****************/
#define DHTTYPE DHT11
DHT dht(DHT_PIN, DHTTYPE);

/*************** ADC CONFIG ****************/
#define ADC_RESOLUTION     4095.0
#define ADC_REF_VOLTAGE    3.3

/*************** AC CONFIG *****************/
#define AC_FREQUENCY        50.0
#define SAMPLES_PER_CYCLE   200
#define NUM_CYCLES          10

/*************** SENSOR CONFIG *************/
#define CURRENT_SENSITIVITY   0.100   // ACS712-20A (V/A)

/*************** CALIBRATION ****************/
#define CURRENT1_CAL_FACTOR  0.8
#define VOLTAGE1_CAL_FACTOR  200.0

#define CURRENT2_CAL_FACTOR  0.32
#define VOLTAGE2_CAL_FACTOR  200.0

/*************** RELAY CONFIG **************/
#define POWER_THRESHOLD_1    150.0
#define POWER_THRESHOLD_2     90.0

/*************** FILTER ********************/
#define CURRENT_NOISE_THRESHOLD 0.05
#define VOLTAGE_NOISE_THRESHOLD 20.0
#define FILTER_ALPHA 0.1

/*************** MQTT PUBLISH INTERVAL *****/
#define MQTT_PUBLISH_INTERVAL 2000  // Publish every 2 seconds
unsigned long lastMQTTPublish = 0;

/*************** GLOBALS *******************/
float currentOffset1 = 0, voltageOffset1 = 0;
float currentOffset2 = 0, voltageOffset2 = 0;

float Vrms1_f = 0, Irms1_f = 0;
float Vrms2_f = 0, Irms2_f = 0;

bool relay1State = true;  // Track relay states
bool relay2State = true;

/*************** DHT STATE *****************/
unsigned long lastDHTRead = 0;
float temperature = NAN;
float humidity    = NAN;

/*************** UTILS *********************/
static inline float adcToVoltage(int adc) {
  return ((float)adc / ADC_RESOLUTION) * ADC_REF_VOLTAGE;
}

/*************** WiFi FUNCTIONS ************/
void setupWiFi() {
  Serial.println("\n📡 Connecting to WiFi...");
  Serial.print("SSID: ");
  Serial.println(WIFI_SSID);
  
  WiFi.mode(WIFI_STA);
  WiFi.disconnect();
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi connected!");
    Serial.print("IP Address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal Strength (RSSI): ");
    Serial.println(WiFi.RSSI());
  } else {
    Serial.println("\n❌ WiFi connection failed!");
    Serial.println("Please check SSID and password!");
  }
}

/*************** MQTT FUNCTIONS ************/
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (unsigned int i = 0; i < length; i++) {
    message += (char)payload[i];
  }
  
  Serial.print("📥 MQTT Message [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(message);
  
  // Handle relay control commands
  if (String(topic) == TOPIC_RELAY1_CONTROL) {
    if (message == "ON" || message == "1" || message.indexOf("true") >= 0) {
      digitalWrite(RELAY1_PIN, LOW);  // Active LOW relay
      relay1State = true;
      publishRelayStatus(1, true);
      Serial.println("⚡ Relay 1 turned ON");
    } else if (message == "OFF" || message == "0" || message.indexOf("false") >= 0) {
      digitalWrite(RELAY1_PIN, HIGH);
      relay1State = false;
      publishRelayStatus(1, false);
      Serial.println("⚡ Relay 1 turned OFF");
    }
  }
  else if (String(topic) == TOPIC_RELAY2_CONTROL) {
    if (message == "ON" || message == "1" || message.indexOf("true") >= 0) {
      digitalWrite(RELAY2_PIN, LOW);  // Active LOW relay
      relay2State = true;
      publishRelayStatus(2, true);
      Serial.println("⚡ Relay 2 turned ON");
    } else if (message == "OFF" || message == "0" || message.indexOf("false") >= 0) {
      digitalWrite(RELAY2_PIN, HIGH);
      relay2State = false;
      publishRelayStatus(2, false);
      Serial.println("⚡ Relay 2 turned OFF");
    }
  }
}

void reconnectMQTT() {
  int attempts = 0;
  while (!mqttClient.connected() && attempts < 3) {
    Serial.print("🔌 Connecting to MQTT Broker at ");
    Serial.print(MQTT_BROKER);
    Serial.print(":");
    Serial.print(MQTT_PORT);
    Serial.print("...");
    
    if (mqttClient.connect(MQTT_CLIENT_ID)) {
      Serial.println(" ✅ Connected!");
      
      // Subscribe to relay control topics
      mqttClient.subscribe(TOPIC_RELAY1_CONTROL);
      mqttClient.subscribe(TOPIC_RELAY2_CONTROL);
      Serial.println("📡 Subscribed to relay control topics");
      return;
    } else {
      Serial.print(" ❌ Failed, rc=");
      Serial.println(mqttClient.state());
      
      // Error code explanations
      switch (mqttClient.state()) {
        case -4:
          Serial.println("   → Connection timeout");
          break;
        case -3:
          Serial.println("   → Connection lost");
          break;
        case -2:
          Serial.println("   → Connect failed - Check broker IP and WiFi network!");
          Serial.print("   → Is PC ");
          Serial.print(MQTT_BROKER);
          Serial.println(" on same WiFi network?");
          Serial.println("   → Is MQTT broker running on PC?");
          Serial.println("   → Check Windows Firewall (allow port 1883)");
          break;
        case -1:
          Serial.println("   → Disconnected");
          break;
        case 1:
          Serial.println("   → Bad protocol");
          break;
        case 2:
          Serial.println("   → Bad client ID");
          break;
        case 3:
          Serial.println("   → Server unavailable");
          break;
        case 4:
          Serial.println("   → Bad credentials");
          break;
        case 5:
          Serial.println("   → Not authorized");
          break;
      }
      
      attempts++;
      if (attempts < 3) {
        Serial.println("Retrying in 5 seconds...");
        delay(5000);
      }
    }
  }
  
  if (!mqttClient.connected()) {
    Serial.println("⚠️ MQTT connection failed after 3 attempts.");
    Serial.println("⚠️ Continuing with measurements only (no MQTT)...");
  }
}

void publishRelayStatus(int loadNumber, bool state) {
  StaticJsonDocument<64> doc;
  doc["relay_state"] = state;
  
  char buffer[64];
  serializeJson(doc, buffer);
  
  const char* topic = (loadNumber == 1) ? TOPIC_RELAY1_STATUS : TOPIC_RELAY2_STATUS;
  mqttClient.publish(topic, buffer);
}

void publishLoadData(int loadNumber, float voltage, float current, float power, bool relayState) {
  StaticJsonDocument<200> doc;
  doc["voltage"] = round(voltage * 10) / 10.0;
  doc["current"] = round(current * 1000) / 1000.0;
  doc["power"] = round(power * 10) / 10.0;
  doc["relay_state"] = relayState;
  
  char buffer[200];
  serializeJson(doc, buffer);
  
  const char* topic = (loadNumber == 1) ? TOPIC_LOAD1_DATA : TOPIC_LOAD2_DATA;
  mqttClient.publish(topic, buffer);
  
  Serial.print("📤 Published Load ");
  Serial.print(loadNumber);
  Serial.print(": ");
  Serial.println(buffer);
}

void publishDHT11Data(float temp, float humid) {
  if (isnan(temp) || isnan(humid)) return;
  
  StaticJsonDocument<100> doc;
  doc["temperature"] = round(temp * 10) / 10.0;
  doc["humidity"] = round(humid * 10) / 10.0;
  
  char buffer[100];
  serializeJson(doc, buffer);
  
  mqttClient.publish(TOPIC_DHT11_DATA, buffer);
  
  Serial.print("📤 Published DHT11: ");
  Serial.println(buffer);
}

/*************** OFFSET CALIBRATION ********/
void calibrateOffsets() {
  const int samples = 5000;
  float sumI1=0, sumV1=0, sumI2=0, sumV2=0;

  Serial.println("⚠ TURN OFF AC POWER (Calibration)");
  delay(4000);

  for (int i = 0; i < samples; i++) {
    sumI1 += adcToVoltage(analogRead(CURRENT1_PIN));
    sumV1 += adcToVoltage(analogRead(VOLTAGE1_PIN));
    sumI2 += adcToVoltage(analogRead(CURRENT2_PIN));
    sumV2 += adcToVoltage(analogRead(VOLTAGE2_PIN));
    delayMicroseconds(50);
  }

  currentOffset1 = sumI1 / samples;
  voltageOffset1 = sumV1 / samples;
  currentOffset2 = sumI2 / samples;
  voltageOffset2 = sumV2 / samples;

  Serial.println("✓ Offset calibration complete");
  Serial.println("⚡ Turn ON AC power\n");
  delay(3000);
}

/*************** SETUP *********************/
void setup() {
  Serial.begin(115200);
  Serial.println("\n🔌 ESP32 Dual AC Load Monitor + MQTT Starting...");

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  pinMode(RELAY1_PIN, OUTPUT);
  pinMode(RELAY2_PIN, OUTPUT);
  digitalWrite(RELAY1_PIN, HIGH);  // OFF initially (active LOW)
  digitalWrite(RELAY2_PIN, HIGH);
  relay1State = false;
  relay2State = false;

  dht.begin();   // ✅ DHT init

  // Connect to WiFi
  setupWiFi();
  
  // Setup MQTT
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  mqttClient.setBufferSize(512);  // Increase buffer for JSON

  calibrateOffsets();
  
  Serial.println("✅ Setup complete! Starting measurements...\n");
}

/*************** LOOP **********************/
void loop() {

  // Maintain WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("⚠️ WiFi disconnected! Reconnecting...");
    setupWiFi();
  }
  
  // Try to maintain MQTT connection (but don't block if it fails)
  if (WiFi.status() == WL_CONNECTED && !mqttClient.connected()) {
    static unsigned long lastReconnectAttempt = 0;
    unsigned long now = millis();
    
    // Only try to reconnect every 10 seconds
    if (now - lastReconnectAttempt > 10000) {
      lastReconnectAttempt = now;
      reconnectMQTT();
    }
  }
  
  if (mqttClient.connected()) {
    mqttClient.loop();  // Process MQTT messages
  }

  /* ============== POWER MEASUREMENT (UNCHANGED) ============== */
  const int totalSamples = SAMPLES_PER_CYCLE * NUM_CYCLES;
  float sumI1_2=0, sumV1_2=0;
  float sumI2_2=0, sumV2_2=0;

  const float period_us = 1000000.0 / AC_FREQUENCY;
  const int sampleDelay_us = period_us / SAMPLES_PER_CYCLE;
  unsigned long start = micros();

  for (int i = 0; i < totalSamples; i++) {

    float vI1 = adcToVoltage(analogRead(CURRENT1_PIN)) - currentOffset1;
    float vV1 = adcToVoltage(analogRead(VOLTAGE1_PIN)) - voltageOffset1;
    float vI2 = adcToVoltage(analogRead(CURRENT2_PIN)) - currentOffset2;
    float vV2 = adcToVoltage(analogRead(VOLTAGE2_PIN)) - voltageOffset2;

    float I1 = vI1 / CURRENT_SENSITIVITY;
    float I2 = vI2 / CURRENT_SENSITIVITY;

    I1 = (1 - FILTER_ALPHA) * Irms1_f + FILTER_ALPHA * I1;
    I2 = (1 - FILTER_ALPHA) * Irms2_f + FILTER_ALPHA * I2;

    sumI1_2 += I1 * I1;
    sumV1_2 += vV1 * vV1;
    sumI2_2 += I2 * I2;
    sumV2_2 += vV2 * vV2;

    while ((micros() - start) < (i + 1) * sampleDelay_us);
  }

  float Irms1 = sqrt(sumI1_2 / totalSamples) * CURRENT1_CAL_FACTOR;
  float Vrms1 = sqrt(sumV1_2 / totalSamples) * VOLTAGE1_CAL_FACTOR;
  float Irms2 = sqrt(sumI2_2 / totalSamples) * CURRENT2_CAL_FACTOR;
  float Vrms2 = sqrt(sumV2_2 / totalSamples) * VOLTAGE2_CAL_FACTOR;

  if (Irms1 < CURRENT_NOISE_THRESHOLD) Irms1 = 0;
  if (Vrms1 < VOLTAGE_NOISE_THRESHOLD) Vrms1 = 0;
  if (Irms2 < CURRENT_NOISE_THRESHOLD) Irms2 = 0;
  if (Vrms2 < VOLTAGE_NOISE_THRESHOLD) Vrms2 = 0;

  Irms1_f = (1-FILTER_ALPHA)*Irms1_f + FILTER_ALPHA*Irms1;
  Vrms1_f = (1-FILTER_ALPHA)*Vrms1_f + FILTER_ALPHA*Vrms1;
  Irms2_f = (1-FILTER_ALPHA)*Irms2_f + FILTER_ALPHA*Irms2;
  Vrms2_f = (1-FILTER_ALPHA)*Vrms2_f + FILTER_ALPHA*Vrms2;

  float P1 = Vrms1_f * Irms1_f;
  float P2 = Vrms2_f * Irms2_f;

  // Update relay states based on power thresholds (only if not controlled remotely)
  // Note: Remote control via MQTT takes precedence
  // digitalWrite(RELAY1_PIN, (P1 < POWER_THRESHOLD_1) ? LOW : HIGH);
  // digitalWrite(RELAY2_PIN, (P2 < POWER_THRESHOLD_2) ? LOW : HIGH);

  /* ================= DHT11 (SAFE & STABLE) ================= */
  if (millis() - lastDHTRead >= 3000) {
    humidity    = dht.readHumidity();
    temperature = dht.readTemperature();
    lastDHTRead = millis();
  }

  /* ================= MQTT PUBLISH ================= */
  if (millis() - lastMQTTPublish >= MQTT_PUBLISH_INTERVAL) {
    // Only publish if MQTT is connected
    if (mqttClient.connected()) {
      // Publish load data
      publishLoadData(1, Vrms1_f, Irms1_f, P1, relay1State);
      publishLoadData(2, Vrms2_f, Irms2_f, P2, relay2State);
      
      // Publish DHT11 data
      publishDHT11Data(temperature, humidity);
    }
    
    lastMQTTPublish = millis();
  }

  /* ================= SERIAL OUTPUT ================= */
  Serial.println("----- LOAD 1 -----");
  Serial.print("V: "); Serial.print(Vrms1_f);
  Serial.print("  I: "); Serial.print(Irms1_f);
  Serial.print("  P: "); Serial.println(P1);

  Serial.println("----- LOAD 2 -----");
  Serial.print("V: "); Serial.print(Vrms2_f);
  Serial.print("  I: "); Serial.print(Irms2_f);
  Serial.print("  P: "); Serial.println(P2);

  if (!isnan(temperature) && !isnan(humidity)) {
    Serial.print("Temperature: "); Serial.print(temperature); Serial.println(" °C");
    Serial.print("Humidity:    "); Serial.print(humidity); Serial.println(" %");
  } else {
    Serial.println("DHT11 read failed");
  }

  Serial.print("MQTT: ");
  Serial.println(mqttClient.connected() ? "Connected" : "Disconnected");
  Serial.print("WiFi: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString() : "Disconnected");

  Serial.println();
  delay(500);  // Reduced delay for faster MQTT response
}
