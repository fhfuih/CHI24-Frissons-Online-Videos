import smbus2 as smbus
from typing import Union, Optional
from threading import Thread

class RawSensor:
    address = 0x24

    def __init__(self, register: int):
        self.bus = smbus.SMBus(1)  # Declare to use I2C 1
        self.register = register
        print(f"{self.__class__.__name__} init at register addr {hex(register)}")

    def get_raw_data(self):
        return self.bus.read_word_data(self.address, self.register)

    def get_data(self) -> Union[int, float]:
        return self.get_raw_data()

    def start_loop(self):
        pass

    def stop_loop(self):
        pass