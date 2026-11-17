// Plantillas de kits: qué piezas necesita cada tipo de proyecto. El
// recomendador (recomendador.js) busca en el catálogo real un producto con
// stock para cada pieza. Agregar un kit nuevo = agregar un objeto aquí.
//   palabras:    si aparecen en la descripción del proyecto, se elige este kit
//   componentes: rol, términos para buscar en nombre/especificaciones/categoría,
//                cantidad y si es opcional (se agrega solo si cabe en el presupuesto)
// Los términos van sin acentos y en minúsculas.

export const PLANTILLAS = [
  {
    id: 'fuente-regulada',
    nombre: 'Fuente regulada ajustable',
    descripcion: 'Fuente de voltaje variable (1.2 V a ~12 V) para alimentar prototipos en la mesa de trabajo.',
    palabras: ['fuente regulada', 'fuente variable', 'fuente ajustable', 'fuente de laboratorio', 'lm317', 'regulador de voltaje'],
    componentes: [
      { rol: 'Regulador de voltaje', buscar: ['lm317', 'regulador', '7805', 'lm2596', 'step down'], cantidad: 1 },
      { rol: 'Alimentación (eliminador o transformador)', buscar: ['eliminador', 'transformador', 'adaptador 12v', 'fuente 12v'], cantidad: 1 },
      { rol: 'Rectificador', buscar: ['puente rectificador', '1n4007', 'diodo'], cantidad: 1 },
      { rol: 'Capacitores de filtrado', buscar: ['capacitor', 'electrolitico'], cantidad: 2 },
      { rol: 'Potenciómetro para ajustar', buscar: ['potenciometro'], cantidad: 1 },
      { rol: 'Voltímetro', buscar: ['voltimetro', 'medidor de voltaje'], cantidad: 1, opcional: true },
    ],
    notas: 'Pon un disipador al regulador si vas a sacar más de 0.5 A.',
  },
  {
    id: 'estacion-meteorologica',
    nombre: 'Estación meteorológica',
    descripcion: 'Mide temperatura y humedad y las muestra en pantalla (y por WiFi con ESP32).',
    palabras: ['clima', 'temperatura', 'humedad', 'meteorolog', 'estacion', 'termometro', 'ambiente'],
    componentes: [
      { rol: 'Microcontrolador', buscar: ['esp32', 'arduino', 'esp8266'], cantidad: 1 },
      { rol: 'Sensor de temperatura y humedad', buscar: ['dht11', 'dht22', 'bme280', 'sensor de temperatura', 'humedad'], cantidad: 1 },
      { rol: 'Pantalla', buscar: ['oled', 'lcd', 'display', 'pantalla'], cantidad: 1 },
      { rol: 'Protoboard', buscar: ['protoboard'], cantidad: 1, opcional: true },
      { rol: 'Cables jumper', buscar: ['jumper', 'cables dupont'], cantidad: 1, opcional: true },
    ],
    notas: 'El DHT11 basta para interiores; para más precisión usa DHT22 o BME280.',
  },
  {
    id: 'robot-seguidor',
    nombre: 'Robot seguidor de línea',
    descripcion: 'Carrito que sigue una línea negra con sensores infrarrojos.',
    palabras: ['robot', 'seguidor', 'carrito', 'motor', 'evasor', 'minisumo'],
    componentes: [
      { rol: 'Microcontrolador', buscar: ['arduino', 'esp32'], cantidad: 1 },
      { rol: 'Driver de motores', buscar: ['l298n', 'driver de motor', 'puente h', 'tb6612'], cantidad: 1 },
      { rol: 'Motorreductores', buscar: ['motorreductor', 'motor dc', 'motor'], cantidad: 2 },
      { rol: 'Sensores infrarrojos', buscar: ['tcrt5000', 'infrarrojo', 'sensor de linea'], cantidad: 2 },
      { rol: 'Batería', buscar: ['bateria', 'porta pilas', '18650', 'lipo'], cantidad: 1 },
      { rol: 'Chasis', buscar: ['chasis'], cantidad: 1, opcional: true },
    ],
  },
  {
    id: 'domotica-wifi',
    nombre: 'Domótica con WiFi',
    descripcion: 'Prende y apaga aparatos desde el celular.',
    palabras: ['domotica', 'casa inteligente', 'iot', 'wifi', 'relevador', 'rele', 'foco', 'automatizar'],
    componentes: [
      { rol: 'Microcontrolador con WiFi', buscar: ['esp32', 'esp8266', 'nodemcu'], cantidad: 1 },
      { rol: 'Módulo relevador', buscar: ['relevador', 'rele', 'relay'], cantidad: 1 },
      { rol: 'Fuente de 5 V', buscar: ['fuente 5v', 'eliminador 5v', 'cargador'], cantidad: 1 },
      { rol: 'Sensor de movimiento', buscar: ['pir', 'movimiento'], cantidad: 1, opcional: true },
    ],
    notas: 'Si vas a conmutar 127 V, hazlo con el relevador y una caja cerrada.',
  },
  {
    id: 'pc-gamer',
    nombre: 'PC para juegos',
    descripcion: 'Procesador, tarjeta gráfica, memoria, almacenamiento y fuente.',
    palabras: ['pc', 'computadora', 'gamer', 'juegos', 'gaming', 'armar pc', 'streaming'],
    componentes: [
      { rol: 'Procesador', buscar: ['ryzen', 'core i', 'procesador'], cantidad: 1 },
      { rol: 'Tarjeta gráfica', buscar: ['rtx', 'rx ', 'tarjeta grafica', 'tarjetas graficas'], cantidad: 1 },
      { rol: 'Memoria RAM', buscar: ['ddr5', 'ddr4', 'memoria ram'], cantidad: 1 },
      { rol: 'Almacenamiento', buscar: ['nvme', 'ssd', 'almacenamiento'], cantidad: 1 },
      { rol: 'Fuente de poder', buscar: ['fuentes de poder', 'rm750', '500 br', 'psu'], cantidad: 1 },
    ],
    notas: 'Revisa que la RAM sea del tipo que acepta la tarjeta madre (DDR4 o DDR5) y que la fuente alcance para la tarjeta gráfica.',
  },
  {
    id: 'pc-escuela',
    nombre: 'PC para escuela u oficina',
    descripcion: 'Equipo básico sin tarjeta gráfica dedicada.',
    // También "pc"/"computadora": así "pc para la escuela" gana sobre el kit gamer.
    palabras: ['pc', 'computadora', 'oficina', 'escuela', 'tareas', 'basica', 'trabajo', 'estudiar'],
    componentes: [
      { rol: 'Procesador', buscar: ['ryzen', 'core i', 'procesador'], cantidad: 1 },
      { rol: 'Memoria RAM', buscar: ['ddr4', 'ddr5', 'memoria ram'], cantidad: 1 },
      { rol: 'Almacenamiento', buscar: ['nvme', 'ssd', 'almacenamiento'], cantidad: 1 },
      { rol: 'Fuente de poder', buscar: ['fuentes de poder', '500 br', 'rm750', 'psu'], cantidad: 1 },
    ],
    notas: 'Elige un procesador con gráficos integrados (los Intel "F" y algunos Ryzen no traen).',
  },
]
