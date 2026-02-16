/************************************************************
 * ESP32 DUAL AC LOAD MONITOR + WIFI + MQTT
 * Temperature Controlled Heater-Fan System
 * Auto (30°C) + Manual Control from Dashboard
 ************************************************************/

#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

/*************** WIFI CONFIG ****************/
const char* WIFI_SSID = "Adiba";
const char* WIFI_PASSWORD = "adiba2001";

/*************** MQTT CONFIG ****************/
const char* MQTT_BROKER = "10.127.149.169";
const int   MQTT_PORT   = 1883;
const char* MQTT_CLIENT_ID = "ESP32_HeaterFan";

/*************** MQTT TOPICS ****************/
const char* TOPIC_LOAD1 = "esp32/heater/data";
const char* TOPIC_LOAD2 = "esp32/fan/data";
const char* TOPIC_DHT   = "esp32/dht/data";

// Control topics (subscribe - receive commands from dashboard)
const char* TOPIC_RELAY1_CTRL = "esp32/relay1/control";
const char* TOPIC_RELAY2_CTRL = "esp32/relay2/control";
const char* TOPIC_MODE_CTRL   = "esp32/mode/control";

// Status topics (publish - send relay state back to dashboard)
const char* TOPIC_RELAY1_STATUS = "esp32/relay1/status";
const char* TOPIC_RELAY2_STATUS = "esp32/relay2/status";

/*************** OBJECTS ********************/
WiFiClient espClient;
PubSubClient mqttClient(espClient);

/*************** PIN CONFIG ****************/
#define CURRENT1_PIN 32
#define VOLTAGE1_PIN 33
#define RELAY1_PIN   25

#define CURRENT2_PIN 34
#define VOLTAGE2_PIN 35
#define RELAY2_PIN   26

#define DHT_PIN 27
#define DHTTYPE DHT11
DHT dht(DHT_PIN, DHTTYPE);

/*************** ADC CONFIG ****************/
#define ADC_RESOLUTION 4095.0
#define ADC_REF_VOLTAGE 3.3
#define AC_FREQUENCY 50.0
#define SAMPLES_PER_CYCLE 200
#define NUM_CYCLES 10
#define CURRENT_SENSITIVITY 0.100

#define CURRENT1_CAL_FACTOR 0.1
#define VOLTAGE1_CAL_FACTOR 400.0  // Adjusted to keep voltage 250-300V range
#define CURRENT2_CAL_FACTOR 0.03
#define VOLTAGE2_CAL_FACTOR 400.0  // Adjusted to keep voltage 250-300V range

#define VOLTAGE_NOISE_THRESHOLD 15.0
#define CURRENT_NOISE_THRESHOLD 0.05
#define VOLTAGE_MAX_LIMIT 260.0
#define FILTER_ALPHA 0.35

#define MQTT_INTERVAL 2000
unsigned long lastMQTT = 0;

/*************** GLOBALS *******************/
float currentOffset1=0, voltageOffset1=0;
float currentOffset2=0, voltageOffset2=0;

float Vrms1_f=0, Irms1_f=0;
float Vrms2_f=0, Irms2_f=0;

// Control mode from dashboard: 'auto' or 'manual'
bool manualMode = false;  // Default to AUTO mode (temperature control)

/*************** UTILITY *******************/
float adcToVoltage(int adc){
  return ((float)adc/ADC_RESOLUTION)*ADC_REF_VOLTAGE;
}

/*************** WIFI **********************/
void setupWiFi(){
  Serial.println("Connecting to WiFi...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  while(WiFi.status()!=WL_CONNECTED){
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi Connected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
}

/*************** MQTT **********************/
void reconnectMQTT(){
  while(!mqttClient.connected()){
    Serial.print("Connecting to MQTT...");
    if(mqttClient.connect(MQTT_CLIENT_ID)){
      Serial.println("Connected");
      // Subscribe to control topics from dashboard
      mqttClient.subscribe(TOPIC_RELAY1_CTRL);
      mqttClient.subscribe(TOPIC_RELAY2_CTRL);
      mqttClient.subscribe(TOPIC_MODE_CTRL);
      Serial.println("Subscribed to control topics");
    }else{
      Serial.print("Failed rc=");
      Serial.println(mqttClient.state());
      delay(3000);
    }
  }
}

void publishData(const char* topic,float V,float I,float P){
  StaticJsonDocument<200> doc;
  doc["voltage"]=round(V*10)/10.0;
  doc["current"]=round(I*1000)/1000.0;
  doc["power"]=round(P*10)/10.0;

  char buffer[200];
  serializeJson(doc,buffer);
  mqttClient.publish(topic,buffer);
}

/*************** PUBLISH RELAY STATUS ******/
void publishRelayStatus(int relay, bool state){
  StaticJsonDocument<100> doc;
  doc["relay_state"]=state;
  char buffer[100];
  serializeJson(doc,buffer);
  
  if(relay==1) mqttClient.publish(TOPIC_RELAY1_STATUS,buffer);
  else         mqttClient.publish(TOPIC_RELAY2_STATUS,buffer);
}

/*************** MQTT CALLBACK *************/
void mqttCallback(char* topic, byte* payload, unsigned int length){
  char msg[length+1];
  memcpy(msg,payload,length);
  msg[length]=0;
  
  Serial.print("MQTT Received [");
  Serial.print(topic);
  Serial.print("]: ");
  Serial.println(msg);
  
  StaticJsonDocument<200> doc;
  if(deserializeJson(doc,msg)) return; // parse error

  // Handle relay control commands from dashboard (only works in manual mode)
  if(strcmp(topic,TOPIC_RELAY1_CTRL)==0){
    if(!manualMode) {
      Serial.println("Ignored relay1 cmd - in Auto mode");
      return;
    }
    bool state = doc["relay_state"] | doc["state"];
    
    digitalWrite(RELAY1_PIN, state ? LOW : HIGH);
    publishRelayStatus(1, state);
    Serial.print("Manual Relay1 -> ");
    Serial.println(state ? "ON" : "OFF");
  }
  else if(strcmp(topic,TOPIC_RELAY2_CTRL)==0){
    if(!manualMode) {
      Serial.println("Ignored relay2 cmd - in Auto mode");
      return;
    }
    bool state = doc["relay_state"] | doc["state"];
    
    digitalWrite(RELAY2_PIN, state ? LOW : HIGH);
    publishRelayStatus(2, state);
    Serial.print("Manual Relay2 -> ");
    Serial.println(state ? "ON" : "OFF");
  }
  else if(strcmp(topic,TOPIC_MODE_CTRL)==0){
    const char* mode = doc["mode"];
    if(mode){
      manualMode = (strcmp(mode, "manual") == 0);
      Serial.print("Mode changed -> ");
      Serial.println(manualMode ? "MANUAL" : "AUTO");
    }
  }
}

/*************** CALIBRATION ***************/
void calibrateOffsets(){
  const int samples=4000;
  float sumI1=0,sumV1=0,sumI2=0,sumV2=0;

  Serial.println("Turn OFF loads for calibration...");
  delay(4000);

  for(int i=0;i<samples;i++){
    sumI1+=adcToVoltage(analogRead(CURRENT1_PIN));
    sumV1+=adcToVoltage(analogRead(VOLTAGE1_PIN));
    sumI2+=adcToVoltage(analogRead(CURRENT2_PIN));
    sumV2+=adcToVoltage(analogRead(VOLTAGE2_PIN));
    delayMicroseconds(50);
  }

  currentOffset1=sumI1/samples;
  voltageOffset1=sumV1/samples;
  currentOffset2=sumI2/samples;
  voltageOffset2=sumV2/samples;

  Serial.println("Calibration Done\n");
}

/*************** SETUP *********************/
void setup(){

  Serial.begin(115200);

  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);

  pinMode(RELAY1_PIN,OUTPUT);
  pinMode(RELAY2_PIN,OUTPUT);

  digitalWrite(RELAY1_PIN,LOW);
  digitalWrite(RELAY2_PIN,LOW);

  dht.begin();

  setupWiFi();
  mqttClient.setServer(MQTT_BROKER,MQTT_PORT);
  mqttClient.setCallback(mqttCallback);

  calibrateOffsets();
}

/*************** LOOP **********************/
void loop(){

  if(WiFi.status()!=WL_CONNECTED) setupWiFi();
  if(!mqttClient.connected()) reconnectMQTT();
  mqttClient.loop();

  const int totalSamples=SAMPLES_PER_CYCLE*NUM_CYCLES;
  float sumI1=0,sumV1=0,sumI2=0,sumV2=0;

  const float period_us=1000000.0/AC_FREQUENCY;
  const int sampleDelay_us=period_us/SAMPLES_PER_CYCLE;
  unsigned long start=micros();

  for(int i=0;i<totalSamples;i++){

    float vI1=adcToVoltage(analogRead(CURRENT1_PIN))-currentOffset1;
    float vV1=adcToVoltage(analogRead(VOLTAGE1_PIN))-voltageOffset1;
    float vI2=adcToVoltage(analogRead(CURRENT2_PIN))-currentOffset2;
    float vV2=adcToVoltage(analogRead(VOLTAGE2_PIN))-voltageOffset2;

    float I1=vI1/CURRENT_SENSITIVITY;
    float I2=vI2/CURRENT_SENSITIVITY;

    sumI1+=I1*I1;
    sumV1+=vV1*vV1;
    sumI2+=I2*I2;
    sumV2+=vV2*vV2;

    while((micros()-start)<(i+1)*sampleDelay_us);
  }

  float Irms1=sqrt(sumI1/totalSamples)*CURRENT1_CAL_FACTOR;
  float Vrms1=sqrt(sumV1/totalSamples)*VOLTAGE1_CAL_FACTOR;
  float Irms2=sqrt(sumI2/totalSamples)*CURRENT2_CAL_FACTOR;
  float Vrms2=sqrt(sumV2/totalSamples)*VOLTAGE2_CAL_FACTOR;

  // Cap voltage at 300V max for safety
  if(Vrms1>300.0) Vrms1=300.0;
  if(Vrms2>300.0) Vrms2=300.0;

  if(Irms1<CURRENT_NOISE_THRESHOLD) Irms1=0;
  if(Irms2<CURRENT_NOISE_THRESHOLD) Irms2=0;

  Vrms1_f=(1-FILTER_ALPHA)*Vrms1_f+FILTER_ALPHA*Vrms1;
  Irms1_f=(1-FILTER_ALPHA)*Irms1_f+FILTER_ALPHA*Irms1;
  Vrms2_f=(1-FILTER_ALPHA)*Vrms2_f+FILTER_ALPHA*Vrms2;
  Irms2_f=(1-FILTER_ALPHA)*Irms2_f+FILTER_ALPHA*Irms2;

  float P1=Vrms1_f*Irms1_f;
  float P2=Vrms2_f*Irms2_f;

  float t=dht.readTemperature();
  float h=dht.readHumidity();

  /******** TEMPERATURE CONTROL (AUTO MODE ONLY) ********/
  if(!manualMode && !isnan(t)){
    if(t>=30.0){
      digitalWrite(RELAY1_PIN,HIGH); // Heater OFF when >=30C
      digitalWrite(RELAY2_PIN,LOW);  // Fan ON when >=30C
    }else{
      digitalWrite(RELAY1_PIN,LOW);  // Heater ON when <30C
      digitalWrite(RELAY2_PIN,HIGH); // Fan OFF when <30C
    }
  }

  /******** MQTT PUBLISH ********/
  if(millis()-lastMQTT>MQTT_INTERVAL){
    publishData(TOPIC_LOAD1,Vrms1_f,Irms1_f,P1);
    publishData(TOPIC_LOAD2,Vrms2_f,Irms2_f,P2);

    if(!isnan(t) && !isnan(h)){
      StaticJsonDocument<100> doc;
      doc["temperature"]=t;
      doc["humidity"]=h;
      char buffer[100];
      serializeJson(doc,buffer);
      mqttClient.publish(TOPIC_DHT,buffer);
    }

    lastMQTT=millis();
  }

  Serial.println("------");
  Serial.print("Temp: ");Serial.println(t);
  Serial.print("Heater Power: ");Serial.println(P1);
  Serial.print("Fan Power: ");Serial.println(P2);

  delay(500);
}
