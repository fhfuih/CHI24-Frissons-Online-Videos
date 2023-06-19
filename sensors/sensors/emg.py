from .abstract_sensor import RawSensor

REGISTER = 0x15
class EMG(RawSensor):
    def __init__(self, register=REGISTER):
        super().__init__(register)

if __name__ == "__main__":
    import time
    sensor = EMG(REGISTER)
    while True:
        print('EMG:', sensor.get_data())
        time.sleep(2)
