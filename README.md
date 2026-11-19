# ESP32 Gesture Drawing

Disegno 3D nel browser controllato dai gesti della mano, usando un ESP32-S3-CAM come sorgente video, MediaPipe Hands per il tracking e Three.js per la visualizzazione.

## Struttura

```text
.
├── .gitignore
├── README.md
├── firmware/
│   └── esp32s3_camera/
│       └── esp32s3_camera.ino
└── frontend/
    ├── app.js
    ├── index.html
    └── styles.css
```

## Requisiti

- Scheda ESP32-S3 con camera e PSRAM.
- Arduino IDE con il core ESP32 Espressif installato.
- Computer e scheda connessi alla stessa rete Wi-Fi.
- Browser moderno con supporto WebGL e moduli JavaScript.

## 1. Configura e carica il firmware

1. Apri `firmware/esp32s3_camera/esp32s3_camera.ino`.
2. Inserisci SSID e password Wi-Fi nei campi `WIFI_SSID` e `WIFI_PASSWORD`.
3. Verifica e configura i pin della camera per la tua precisa revisione della scheda. I pin nel file sono un esempio: le schede ESP32-S3-CAM, inclusi i prodotti Elegoo, possono avere pinout differenti. Consulta lo schema elettrico del tuo modello.
4. In Arduino IDE seleziona la scheda ESP32-S3 corretta e abilita PSRAM se previsto dalla scheda.
5. Carica lo sketch e apri il Monitor Seriale a 115200 baud. Annota l'indirizzo IP stampato.
6. Verifica il flusso aprendo `http://INDIRIZZO_IP/stream` nella rete locale.

Il firmware espone lo stream MJPEG su `/stream` e un singolo fotogramma JPEG su `/capture`.

## 2. Avvia il frontend

Dalla cartella del repository:

```bash
cd frontend
python3 -m http.server 8080
```

Apri `http://localhost:8080`, inserisci l'URL `http://INDIRIZZO_IP/stream` e premi **Connetti**. Il browser scarica MediaPipe e Three.js dalle CDN: per il primo avvio è necessaria una connessione Internet.

> Usa `localhost` per il frontend durante lo sviluppo. I browser possono bloccare uno stream HTTP se la pagina è servita via HTTPS (contenuto misto). L'accesso alla camera dell'ESP32 e il frontend devono inoltre essere raggiungibili dalla stessa rete.

## Gesti

- **Pinch pollice-indice:** inizia/interrompe il tratto.
- **Indice e medio alzati:** passa al colore successivo.
- **Pugno:** rimuove l'ultimo tratto.
- **Mano aperta o altri gesti:** sposta il cursore senza disegnare.
- **Cancella tutto:** pulsante nell'interfaccia.

La coordinata Z è una stima euristica dalla dimensione apparente della mano, non una misura di profondità calibrata. Regola soglie e mappatura in `frontend/app.js` in base a camera, distanza e illuminazione.

## Risoluzione problemi

- **Nessun flusso:** controlla IP, rete Wi-Fi e pinout; prova `/capture` e `/stream` direttamente nel browser.
- **Errore camera nel firmware:** verifica i pin e che PSRAM sia disponibile/abilitata.
- **Il frontend non carica MediaPipe:** controlla la connessione Internet e la console sviluppatore.
- **Prestazioni basse:** prova a diminuire `FRAMESIZE_VGA` a `FRAMESIZE_QVGA` nel firmware.

## Note

Questo progetto è una base dimostrativa, non un firmware universale: la configurazione dei pin dipende esattamente dalla scheda camera utilizzata. Non pubblicare credenziali Wi-Fi reali nel repository.
