import time
import threading
from .abstract_sensor import RawSensor

ADDRESS = 0X24
REGISTER = 0x10
FRAME_RATE = 200 # interval = 5ms

class PulseSensor(RawSensor):
    def __init__(self, register=REGISTER, frame_rate=FRAME_RATE):
        super().__init__(register)

        self.frame_rate = frame_rate
        self.intervalMs = 1000 // frame_rate
        self.__reset_variables(init=True)

        self.thread = None
        self.stop_thread = False

        # self.log = open('./fuck.txt', 'w')
        print(f"Pulse Sensor init with frame rate {self.frame_rate}, loop interval {self.intervalMs / 1000}")

    # def __del__(self):
    #     if self.log:
    #         self.log.close()

    def get_data(self):
        return self.BPM

    def get_raw_data(self):
        return self.Signal

    def start_loop(self):
        # Do nothing if the thread is already running
        if self.thread is not None:
            return
        self.stop_thread = False
        self.thread = threading.Thread(target=self.__loop, daemon=True)
        self.thread.start()

    def stop_loop(self):
        self.stop_thread = True
        self.thread.join()
        self.thread = None

    def __loop(self):
        while not self.stop_thread:
            self.__loop_routine()
            time.sleep(self.intervalMs / 1000)
            # if self.log:
            #     self.log.write(f"{time.time()}\n")
            #     self.log.flush()
 

    def __loop_routine(self):
        """
        A Python rewrite of https://github.com/WorldFamousElectronics/PulseSensorPlayground/blob/master/src/utility/PulseSensor.cpp#L124C29-L124C29
        """
        Signal = super().get_raw_data()
        self.Signal = Signal

        thisRoutineTimestamp = time.time()
        if self.lastRoutineTimestamp is None:
            elapsedMsBetweenRoutine = self.intervalMs
        else:
            elapsedMsBetweenRoutine = int((thisRoutineTimestamp - self.lastRoutineTimestamp) * 1000)
        self.lastRoutineTimestamp = thisRoutineTimestamp

        self.sampleCounter += elapsedMsBetweenRoutine
        N = self.sampleCounter - self.lastBeatTime  # monitor the time since the last beat to avoid noise

        # find the peak and trough of the pulse wave
        if Signal < self.thresh and N > (self.IBI / 5) * 3:  # avoid dichrotic noise by waiting 3/5 of last IBI
            if Signal < self.T:  # T is the trough
                self.T = Signal  # keep track of lowest point in pulse wave

        if Signal > self.thresh and Signal > self.P:  # thresh condition helps avoid noise
            self.P = Signal  # P is the peak

        # NOW IT'S TIME TO LOOK FOR THE HEART BEAT
        # signal surges up in value every time there is a pulse
        if N > 250:  # avoid high frequency noise
            if (Signal > self.thresh) and (self.Pulse == False) and (N > (self.IBI / 5) * 3):
                self.Pulse = True  # set the Pulse flag when we think there is a pulse
                self.IBI = self.sampleCounter - self.lastBeatTime  # measure time between beats in mS
                self.lastBeatTime = self.sampleCounter  # keep track of time for next pulse

                if self.secondBeat:  # if this is the second beat, if secondBeat == TRUE
                    self.secondBeat = False  # clear secondBeat flag
                    for i in range(10):
                        self.rate[i] = self.IBI

                if self.firstBeat:  # if it's the first time we found a beat, if firstBeat == TRUE
                    self.firstBeat = False  # clear firstBeat flag
                    self.secondBeat = True  # set the second beat flag
                    return  # IBI value is unreliable so discard it

                runningTotal = 0
                for i in range(9):
                    self.rate[i] = self.rate[i + 1]
                    runningTotal += self.rate[i]
                self.rate[9] = self.IBI
                runningTotal += self.IBI
                runningTotal /= 10
                self.BPM = 60000 / runningTotal  # how many beats can fit into a minute? that's BPM!
                self.QS = True

        if Signal < self.thresh and self.Pulse == True:  # when the values are going down, the beat is over
            self.Pulse = False  # reset the Pulse flag so we can do it again
            self.amp = self.P - self.T  # get amplitude of the pulse wave
            self.thresh = self.amp / 2 + self.T  # set thresh at 50% of the amplitude
            self.P = self.thresh  # reset these for next time
            self.T = self.thresh

        if N > 2500:  # if 2.5 seconds go by without a beat
            self.__reset_variables()

    def __reset_variables(self, init=False):
        if init:
            self.Signal = 0
            self.sampleCounter = 0
            self.rate = [0] * 10
            self.IBI = 750
        else:
            self.IBI = 600  # 600ms per beat = 100 Beats Per Minute (BPM)

        self.lastRoutineTimestamp = None
        self.thresh = 550  # threshold a little above the trough # 525?
        self.P = 512  # peak at 1/2 the input range of 0..1023
        self.T = 512  # trough at 1/2 the input range.
        self.lastBeatTime = self.sampleCounter
        self.firstBeat = True  # looking for the first beat
        self.secondBeat = False  # not yet looking for the second beat in a row
        self.QS = False
        self.BPM = 0
        self.Pulse = False
        self.amp = 100  # beat amplitude 1/10 of input range.


if __name__ == "__main__":
    sensor = PulseSensor(REGISTER)
    while True:
        print('Heart Rate:', sensor.get_data(), 'Raw data:', sensor.get_raw_data())
        time.sleep(1)
