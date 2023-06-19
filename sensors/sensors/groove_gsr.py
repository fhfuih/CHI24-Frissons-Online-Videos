from .abstract_sensor import RawSensor

REGISTER = 0x14

class GrooveGSR(RawSensor):
    def __init__(self, register=REGISTER):
        super().__init__(register)

if __name__ == "__main__":
    import time
    sensor = GrooveGSR(REGISTER)
    while True:
        print('GSR:', sensor.get_data())
        time.sleep(2)
