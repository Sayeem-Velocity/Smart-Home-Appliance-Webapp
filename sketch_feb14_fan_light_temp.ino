/************************************************************
 * ESP32 DUAL AC LOAD MONITOR
 * Temperature Controlled Heater-Fan System
 ************************************************************/

#include <DHT.h>

/*************** PIN CONFIG ****************/
#define CURRENT1_PIN 32
#define VOLTAGE1_PIN 33
#define RELAY1_PIN   25   // Bulb (Heater)

#define CURRENT2_PIN 34
#define VOLTAGE2_PIN 35
#define RELAY2_PIN   26   // Fan

#define DHT_PIN 27
#define DHTTYPE DHT11

DHT dht(DHT_PIN, DHTTYPE);

/*************** ADC CONFIG ****************/
#define ADC_RESOLUTION 4095.0
#define ADC_REF_VOLTAGE 3.3

/*************** AC CONFIG *****************/
#define AC_FREQUENCY 50.0
#define SAMPLES_PER_CYCLE 200
#define NUM_CYCLES 10

/*************** SENSOR CONFIG *************/
#define CURRENT_SENSITIVITY 0.100

/*************** CALIBRATION ***************/
#define CURRENT1_CAL_FACTOR 0.1
#define VOLTAGE1_CAL_FACTOR 450.0
#define CURRENT2_CAL_FACTOR 0.03
#define VOLTAGE2_CAL_FACTOR 450.0

#define VOLTAGE_NOISE_THRESHOLD 15.0
#define CURRENT_NOISE_THRESHOLD 0.05
#define VOLTAGE_MAX_LIMIT 260.0

#define FILTER_ALPHA 0.35

float currentOffset1=0, voltageOffset1=0;
float currentOffset2=0, voltageOffset2=0;

float Vrms1_f=0, Irms1_f=0;
float Vrms2_f=0, Irms2_f=0;

/*************** UTILITY *******************/
float adcToVoltage(int adc){
  return ((float)adc/ADC_RESOLUTION)*ADC_REF_VOLTAGE;
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
  calibrateOffsets();
}

/*************** LOOP **********************/
void loop(){

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

  float rawIrms1=sqrt(sumI1/totalSamples);
  float rawVrms1=sqrt(sumV1/totalSamples);
  float rawIrms2=sqrt(sumI2/totalSamples);
  float rawVrms2=sqrt(sumV2/totalSamples);

  float Irms1=rawIrms1*CURRENT1_CAL_FACTOR;
  float Vrms1=rawVrms1*VOLTAGE1_CAL_FACTOR;
  float Irms2=rawIrms2*CURRENT2_CAL_FACTOR;
  float Vrms2=rawVrms2*VOLTAGE2_CAL_FACTOR;

  if(Vrms1<VOLTAGE_NOISE_THRESHOLD) Vrms1=0;
  if(Vrms2<VOLTAGE_NOISE_THRESHOLD) Vrms2=0;
  if(Irms1<CURRENT_NOISE_THRESHOLD) Irms1=0;
  if(Irms2<CURRENT_NOISE_THRESHOLD) Irms2=0;

  if(Vrms1>VOLTAGE_MAX_LIMIT) Vrms1=VOLTAGE_MAX_LIMIT;
  if(Vrms2>VOLTAGE_MAX_LIMIT) Vrms2=VOLTAGE_MAX_LIMIT;

  Vrms1_f=(1-FILTER_ALPHA)*Vrms1_f+FILTER_ALPHA*Vrms1;
  Irms1_f=(1-FILTER_ALPHA)*Irms1_f+FILTER_ALPHA*Irms1;
  Vrms2_f=(1-FILTER_ALPHA)*Vrms2_f+FILTER_ALPHA*Vrms2;
  Irms2_f=(1-FILTER_ALPHA)*Irms2_f+FILTER_ALPHA*Irms2;

  float P1=Vrms1_f*Irms1_f;
  float P2=Vrms2_f*Irms2_f;

  float t=dht.readTemperature();
  float h=dht.readHumidity();

  /*************** TEMPERATURE CONTROL LOGIC ***************/
  if(!isnan(t)){
    if(t >= 30.0){
      // High temperature → Fan ON, Bulb OFF
      digitalWrite(RELAY2_PIN, LOW);   // Fan ON
      digitalWrite(RELAY1_PIN, HIGH);  // Heater OFF
    }
    else{
      // Low temperature → Bulb ON, Fan OFF
      digitalWrite(RELAY2_PIN, HIGH);  // Fan OFF
      digitalWrite(RELAY1_PIN, LOW);   // Heater ON
    }
  }

  Serial.println("========================================");
  Serial.println("LOAD 1 → HEATER (Bulb)");
  Serial.print("Voltage: "); Serial.print(Vrms1_f,2);
  Serial.print("  Current: "); Serial.print(Irms1_f,3);
  Serial.print("  Power: "); Serial.println(P1,2);

  Serial.println("LOAD 2 → FAN");
  Serial.print("Voltage: "); Serial.print(Vrms2_f,2);
  Serial.print("  Current: "); Serial.print(Irms2_f,3);
  Serial.print("  Power: "); Serial.println(P2,2);

  Serial.print("Temperature: "); Serial.print(t);
  Serial.print("  Humidity: "); Serial.println(h);

  Serial.println("========================================\n");

  delay(1000);
}
