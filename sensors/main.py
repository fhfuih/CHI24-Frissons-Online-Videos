import sys
from enum import Enum
from time import sleep, time
import json
from json import JSONDecodeError
import logging
import threading
# import multiprocessing as mp
from functools import partial
from typing import Callable, Any, Optional, Union

from gpiozero import PWMOutputDevice
from paho.mqtt import client as mqtt

from sensors import RawSensor, GrooveGSR, PulseSensor, EMG

# MQTT connection setup
broker = 'localhost'
port = 1883
username = 'zeyu'
password = 'YouAreTheBest'
client_id = 'raspberry-pi'
topics = {
    'publisher': 'sensor/data',
    'subscriber': 'sensor/commands',
}
topics = {
    'data': 'sensor/data',
    'commands': 'sensor/commands',
    'vibration': 'motor/vibration',
}
class Topic(Enum):
    DATA = 'sensor/data'
    COMMANDS = 'sensor/commands'
    VIBRATION = 'motor/vibration'

# MQTT connection options
QOS=1
FIRST_RECONNECT_DELAY = 1
RECONNECT_RATE = 2
MAX_RECONNECT_COUNT = 12
MAX_RECONNECT_DELAY = 60
SENSOR_INTERVAL = 0.2

# vibration motor
pwm_motor = PWMOutputDevice(18)

# sensors
sensors: dict[str, RawSensor] = {
    'GSR': GrooveGSR(),
    'HR': PulseSensor(),
    # 'EMG': EMG(),
}
assert threading.active_count() == 1

sensor_process: Optional[threading.Thread] = None
sensor_stop_signal = False

def sensor_target(client: mqtt.Client, publish: Callable[[Any, mqtt.Client], None]):
    for s in sensors.values():
        s.start_loop()
    print("sensor loops started", threading.active_count())

    while not sensor_stop_signal:
        ts = time()
        values = {name: s.get_data() for name, s in sensors.items()}
        values['ts'] = ts
        publish(values, client)
        sleep(SENSOR_INTERVAL)

    for s in sensors.values():
        s.stop_loop()
    print("sensor loops stopped", threading.active_count())

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to MQTT Broker!")
    else:
        print("Failed to connect, return code", rc)
    subscribe(client)

def on_disconnect(client, userdata, rc):
    logging.info("Disconnected with result code: %s", rc)
    reconnect_count, reconnect_delay = 0, FIRST_RECONNECT_DELAY
    while reconnect_count < MAX_RECONNECT_COUNT:
        logging.info("Reconnecting in %d seconds...", reconnect_delay)
        sleep(reconnect_delay)

        try:
            client.reconnect()
            logging.info("Reconnected successfully!")
            return
        except Exception as err:
            logging.error("%s. Reconnect failed. Retrying...", err)

        reconnect_delay *= RECONNECT_RATE
        reconnect_delay = min(reconnect_delay, MAX_RECONNECT_DELAY)
        reconnect_count += 1
    logging.info("Reconnect failed after %s attempts. Exiting...", reconnect_count)

def publish(msg, client: mqtt.Client):
    message = msg if isinstance(msg, bytes) else json.dumps(msg).encode()
    result = client.publish(Topic.DATA.value, message, qos=QOS)
    if result.rc != 0:
        print("Failed to send message #{result.mid} {message}")
    # print(f"sending #{result.mid} {message}")

# def on_publish(client, userdata, mid):
#     print(f"published #{mid}")

def on_message(client, userdata, msg):
    global sensor_process, sensor_stop_signal
    try:
        message = json.loads(msg.payload)
        action = message['action']
    except JSONDecodeError:
        print(f"Expect message to be JSON. Got {msg.payload.decode()} from {msg.topic}")
        return
    except (TypeError, KeyError):
        print(f"Expect message to have action. Got {msg.payload.decode()} from {msg.topic}")
        return

    if action == 'SENSOR_UP':
        if sensor_process is not None:
            print("SENSOR_UP and sensor is already up!")
            return
        sensor_stop_signal = False
        sensor_process = threading.Thread(
            target=sensor_target,
            args=(client, publish),
            daemon=True
        )
        sensor_process.start()
        print("sensor up!", threading.active_count())
    elif action == 'SENSOR_DOWN':
        if sensor_process is None:
            print('SENSOR_DOWN but sensor is already down')
            return
        sensor_stop_signal = True
        sensor_process.join()
        sensor_process = None
        print('sensor down!', threading.active_count())
    elif action == 'SET_VIBRATION':
        pwm_motor.value = message['value']
        # print('set motor value to', message['value'])
    elif action == 'STOP_VIBRATION':
        pwm_motor.off()
    else:
        print(f"Unknown action {message['action'] or 'None'} from {msg.topic}")

def subscribe(client: mqtt.Client):
    client.on_message = on_message
    client.subscribe([(Topic.COMMANDS.value, QOS), (Topic.VIBRATION.value, 0)])

def connect_mqtt():
    client = mqtt.Client(client_id=client_id)
    client.username_pw_set(username, password)
    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    # client.on_publish = on_publish
    client.connect(broker, port)
    return client

if __name__ == "__main__":
    client = connect_mqtt()
    client.loop_forever()
