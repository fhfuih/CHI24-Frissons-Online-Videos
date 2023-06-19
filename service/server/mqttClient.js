const mqtt = require("mqtt");

const DEBUG = process.argv[2] == 'debug'

const topics = {
  data: 'sensor/data',
  commands: 'sensor/commands',
  vibration: 'motor/vibration',
}
const publishOptions = {
  qos: 1,
}

const client = mqtt.connect("tcp://192.168.1.102:1883", {
  username: 'zeyu',
  password: 'YouAreTheBest',
  clientId: 'central-backend',
  // connectTimeout: 1000,
});
DEBUG && console.error("Connecting!")

/**
* @type {null | (_: Object.<string, number>) => void}
*/
let onMessageCallback = null

client.on("error", (err) => {
  console.error(err)
  throw err
})
client.on('reconnect', () => {
  console.error("MQTT Reconnecting")
})
client.on('close', () => {
  console.error("MQTT connection closed")
})
client.on('offline', () => {
  console.error('MQTT Client went offline')
})

client.on("connect", function () {
  console.error("MQTT Connected!")
  subscribe()
});

function subscribe() {
  client.on("message", function (topic, message) {
    const m = JSON.parse(message.toString())
    onMessageCallback?.(m)
  });
  client.subscribe(topics.data, {
    qos: 1
  }, (err) => {
    if (err) {
      console.error(err)
      throw err;
    }
    if (DEBUG) {
      sensorUp()
      setTimeout(sensorDown, 2000)
      setTimeout(sensorUp, 4000)
      setTimeout(sensorDown, 6000)
    }
  });
}

/**
 * @param {mqtt.PacketCallback} callback 
 */
function sensorUp(callback) {
  client.publish(
    topics.commands,
    JSON.stringify({
      action: 'SENSOR_UP',
    }),
    publishOptions,
    callback)
}

/**
 * @param {mqtt.PacketCallback} callback 
 */
function sensorDown(callback) {
  client.publish(
    topics.commands,
    JSON.stringify({
      action: 'SENSOR_DOWN'
    }),
    publishOptions,
    callback)
}

/**
 * @param {number} value 
 * @param {mqtt.PacketCallback} callback 
 */
function setVibration(value, callback) {
  client.publish(
    topics.vibration,
    JSON.stringify({
      action: 'SET_VIBRATION',
      value,
    }),
    {},
    callback)
}

function endClient() {
  client.end()
}

function onMQTTMessage(callback) {
  onMessageCallback = callback;
}

module.exports = {
  sensorUp,
  sensorDown,
  setVibration,
  endClient,
  onMQTTMessage,
}