import socket
import sys
import time
from time import sleep
import random
from struct import pack

from sensors import RawSensor, GrooveGSR, PulseSensor, EMG

host = '192.168.1.100'
port = 65000
server_address = (host, port)

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
print(f'Starting UDP server on {host} port {port}')

sensors = (GrooveGSR(), PulseSensor(), EMG())
interval = 0.2

while True:
    ts = time.time()
    values = [s.get_raw_data() for s in sensors]
    format = str(len(values) + 1) + 'f'
    message = pack(format, ts, *values)
    sock.sendto(message, server_address)
    print(f"At {time.ctime(ts)}: {values}")
    sleep(interval)
