#include <WiFi.h>
#include "esp_camera.h"
#include "esp_http_server.h"

// Inserisci le credenziali locali. Non caricare credenziali reali su un repository pubblico.
static const char* WIFI_SSID = "INSERISCI_SSID";
static const char* WIFI_PASSWORD = "INSERISCI_PASSWORD";

// ESEMPIO DI PINOUT: verifica ogni pin sullo schema della tua specifica ESP32-S3-CAM.
// Il pinout Elegoo e le revisioni hardware possono differire da questo esempio.
#define PWDN_GPIO_NUM    -1
#define RESET_GPIO_NUM   -1
#define XCLK_GPIO_NUM    15
#define SIOD_GPIO_NUM     4
#define SIOC_GPIO_NUM     5
#define Y9_GPIO_NUM      16
#define Y8_GPIO_NUM      17
#define Y7_GPIO_NUM      18
#define Y6_GPIO_NUM      12
#define Y5_GPIO_NUM      10
#define Y4_GPIO_NUM       8
#define Y3_GPIO_NUM       9
#define Y2_GPIO_NUM      11
#define VSYNC_GPIO_NUM    6
#define HREF_GPIO_NUM     7
#define PCLK_GPIO_NUM    13

static httpd_handle_t cameraHttpServer = nullptr;

static esp_err_t streamHandler(httpd_req_t* request) {
  static const char* boundary = "frame";
  char header[128];

  httpd_resp_set_type(request, "multipart/x-mixed-replace;boundary=frame");
  httpd_resp_set_hdr(request, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store, no-cache, must-revalidate");

  while (true) {
    camera_fb_t* frame = esp_camera_fb_get();
    if (!frame) {
      Serial.println("Errore: acquisizione frame fallita");
      return ESP_FAIL;
    }

    const int headerLength = snprintf(
      header,
      sizeof(header),
      "\r\n--%s\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",
      boundary,
      static_cast<unsigned int>(frame->len)
    );

    const esp_err_t headerResult = httpd_resp_send_chunk(request, header, headerLength);
    const esp_err_t frameResult = headerResult == ESP_OK
      ? httpd_resp_send_chunk(request, reinterpret_cast<const char*>(frame->buf), frame->len)
      : headerResult;

    esp_camera_fb_return(frame);
    if (frameResult != ESP_OK) break; // Il client ha chiuso la connessione.
  }

  httpd_resp_send_chunk(request, nullptr, 0);
  return ESP_OK;
}

static esp_err_t captureHandler(httpd_req_t* request) {
  camera_fb_t* frame = esp_camera_fb_get();
  if (!frame) {
    httpd_resp_send_500(request);
    return ESP_FAIL;
  }

  httpd_resp_set_type(request, "image/jpeg");
  httpd_resp_set_hdr(request, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store");
  const esp_err_t result = httpd_resp_send(
    request,
    reinterpret_cast<const char*>(frame->buf),
    frame->len
  );
  esp_camera_fb_return(frame);
  return result;
}

static void startCameraServer() {
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = 80;
  config.ctrl_port = 32768;
  config.lru_purge_enable = true;
  config.max_open_sockets = 3;

  const httpd_uri_t streamUri = {
    .uri = "/stream",
    .method = HTTP_GET,
    .handler = streamHandler,
    .user_ctx = nullptr
  };
  const httpd_uri_t captureUri = {
    .uri = "/capture",
    .method = HTTP_GET,
    .handler = captureHandler,
    .user_ctx = nullptr
  };

  if (httpd_start(&cameraHttpServer, &config) == ESP_OK) {
    httpd_register_uri_handler(cameraHttpServer, &streamUri);
    httpd_register_uri_handler(cameraHttpServer, &captureUri);
    Serial.println("Server camera avviato su porta 80");
  } else {
    Serial.println("Errore avvio server HTTP");
  }
}

static bool initializeCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = psramFound() ? FRAMESIZE_VGA : FRAMESIZE_QVGA;
  config.jpeg_quality = 12;
  config.fb_count = psramFound() ? 2 : 1;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = psramFound() ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;

  const esp_err_t result = esp_camera_init(&config);
  if (result != ESP_OK) {
    Serial.printf("Inizializzazione camera fallita: 0x%x\n", result);
    return false;
  }

  return true;
}

void setup() {
  Serial.begin(115200);
  delay(300);

  if (String(WIFI_SSID) == "INSERISCI_SSID" || String(WIFI_PASSWORD) == "INSERISCI_PASSWORD") {
    Serial.println("Configura WIFI_SSID e WIFI_PASSWORD prima di caricare lo sketch.");
    return;
  }

  if (!initializeCamera()) return;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connessione Wi-Fi");

  const unsigned long startTime = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startTime < 30000) {
    delay(500);
    Serial.print('.');
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("\nConnessione Wi-Fi non riuscita; controlla credenziali e rete.");
    return;
  }

  Serial.println();
  Serial.print("Stream MJPEG: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/stream");
  Serial.print("Snapshot JPEG: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/capture");
  startCameraServer();
}

void loop() {
  delay(1000);
}
