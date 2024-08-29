import RPi.GPIO as GPIO
import serial
import sys
import time
from time import sleep
from datetime import datetime
import requests
import glob
from mfrc522 import SimpleMFRC522
import threading

GPIO.setmode(GPIO.BOARD)
GPIO.setwarnings(False)

# Defining pins
ledGreen = 40
ledRed = 38
nagib = 13
plamen = 11
dim = 12
trig = 16
echo = 18

#GPS module
ser = serial.Serial ("/dev/ttyAMA0", baudrate=9600, timeout=1)
GPGGA_buffer = 0
NMEA_buff = 0

# Output settings
GPIO.setup(ledGreen, GPIO.OUT)
GPIO.setup(ledRed, GPIO.OUT)
GPIO.setup(nagib, GPIO.IN, pull_up_down=GPIO.PUD_UP)
GPIO.setup(plamen, GPIO.IN)
GPIO.setup(dim, GPIO.IN)
GPIO.setup(echo, GPIO.IN)
GPIO.setup(trig, GPIO.OUT)

reader = SimpleMFRC522()

# List to save readings
ocitanja = []
sensor_rfid = 876327797747
known_rfids = {
    sensor_rfid: 'ZG-Vern'  # Sensor RFID with its name
}
rfid_data = {
    'podrucje': {},
    'volumen': {},
    'vrsta_otpad': {}
}
active_rfids = set()
latest_rfid = None
latest_naziv = None
rfid_ocitan = threading.Event()

#GPS module
def convert_to_degrees(raw_value):
    decimal_value = raw_value/100.00
    degrees = int(decimal_value)
    mm_mmmm = (decimal_value - degrees)/0.6
    position = degrees + mm_mmmm
    return "%.4f" % position

def read_gps():
    gpgga_info = "$GPGGA,"
    try:
        start_time = time.time()
        timeout = 10  # 10 seconds timeout
        while True:
            received_data = (str)(ser.read(200).decode('ascii', errors='ignore')) # read NMEA string received
            GPGGA_data_available = received_data.find(gpgga_info) #check for NMEA GPGGA string
            
            if (GPGGA_data_available > 0):
                GPGGA_buffer = received_data.split("$GPGGA,",1)[1] #store data coming after "$GPGGA," string
                NMEA_buff = (GPGGA_buffer.split(','))
                
                if len(NMEA_buff) >= 5:
                    nmea_latitude = NMEA_buff[1] #extract latitude from GPGGA string
                    nmea_longitude = NMEA_buff[3]
                    
                    if nmea_latitude and nmea_longitude:
                        try:
                            lat = (float(convert_to_degrees(float(nmea_latitude))))
                            lng = (float(convert_to_degrees(float(nmea_longitude))))
                            return lat, lng
                        except ValueError:
                            return 0.0, 0.0
            if time.time() - start_time > timeout:
                print("Timeout occurred while waiting for GPS data.")
                break
            time.sleep(1)  # Wait before next read
            print("No valid GPGGA data available.")
            return 0.0, 0.0
    except Exception as e:
        print(f"GPS reading error: {e}")
        return 0.0, 0.0

# Temperature reading
def read_temp_raw():
    base_dir = '/sys/bus/w1/devices/'
    device_folders = glob.glob(base_dir + '28*')
    if not device_folders:
        raise ValueError("No DS18B20 device found")
    device_folder = device_folders[0]
    device_file = device_folder + '/w1_slave'
    with open(device_file, 'r') as f:
        lines = f.readlines()
    return lines

def read_temp():
    try:
        lines = read_temp_raw()
        while lines[0].strip()[-3:] != 'YES':
            time.sleep(0.2)
            lines = read_temp_raw()
        equals_pos = lines[1].find('t=')
        if equals_pos != -1:
            temp_string = lines[1][equals_pos+2:]
            temp_c = float(temp_string) / 1000.0
            return round(temp_c, 2)
        return 0.0
    except Exception as e:
        print(f"Temperature reading error: {e}")
        return 0.0

# Measuring Fill Level
def read_fill_level(max_distance):
    try:
        # Resetting the trig pin
        GPIO.output(trig, GPIO.LOW)
        time.sleep(0.2)
        
        GPIO.output(trig, GPIO.HIGH)
        time.sleep(0.00001)
        GPIO.output(trig, GPIO.LOW)

        while GPIO.input(echo) == 0:
            pulse_start_time = time.time()
        while GPIO.input(echo) == 1:
            pulse_end_time = time.time()

        pulse_duration = pulse_end_time - pulse_start_time
        distance = round(pulse_duration * 17150, 2)

        if distance <= 0:
            percentage = 100.0
        elif distance >= max_distance:
            percentage = 0.0
        else:
            percentage = (max_distance - distance) / max_distance * 100.0
            percentage = round(percentage, 2)

        return percentage
    except Exception as e:
        print(f"Fill measurement error: {e}")
        return 0.0

def add_info_rfid(rfid, podrucje, volumen, vrsta_otpad):
    rfid_data['podrucje'][rfid] = podrucje
    rfid_data['volumen'][rfid] = volumen
    rfid_data['vrsta_otpad'][rfid] = vrsta_otpad

# RFID reading
def read_rfid():
    global known_rfids, latest_rfid, latest_naziv, active_rfids
    try:
        rfid, data = reader.read()
        data = data.strip()

        if rfid:
            # Setting default values for naziv, podrucje, volumen i vrsta_otpad
            naziv = ""
            podrucje = ""
            volumen = 0.0
            vrsta_otpad = ""
            
            try:
                naziv, podrucje, volumen, vrsta_otpad = data.split('|')
                
                try:
                    volumen = float(volumen)
                except ValueError:
                    print("Error converting volume to number.")
                    volumen = 0.0  # Set to 0.0 if conversion fails
            except ValueError:
                print("Data splitting error. Check the data format on the RFID.")
                return rfid, None
            
            print(f"Read RFID: {rfid}, Name: {naziv}")
            
            if rfid in known_rfids:
                if rfid in active_rfids:
                    print(f"RFID tag with name {known_rfids[rfid]} already exists!")
                else:
                    print(f"RFID tag {known_rfids[rfid]} has been added again!")
                    latest_rfid = rfid
                    latest_naziv = known_rfids[rfid]
                    active_rfids.add(rfid)
                    rfid_ocitan.set()

            else:
                if naziv in known_rfids.values():
                    print(f"RFID tag with name {naziv} already exists!")
                    return rfid, naziv
                
                known_rfids[rfid] = naziv
                active_rfids.add(rfid)
                print(f"A new RFID tag {naziv} has been added!")
                
            add_info_rfid(rfid, podrucje, volumen, vrsta_otpad)

            # LED signaling for successful reading
            for _ in range(4):
                GPIO.output(ledGreen, GPIO.HIGH)
                time.sleep(0.4)
                GPIO.output(ledGreen, GPIO.LOW)
                time.sleep(0.2)
            
            # Restart if the system is active
            GPIO.output(ledGreen, GPIO.HIGH)

            latest_rfid = rfid
            latest_naziv = naziv
            rfid_ocitan.set()
                
            return rfid, naziv
        else:
            GPIO.output(ledRed, GPIO.HIGH)
            time.sleep(1)
            GPIO.output(ledRed, GPIO.LOW)
            return None, None

    except Exception as e:
        print(f"RFID error: {e}")
        GPIO.output(ledRed, GPIO.HIGH)
        time.sleep(1)
        GPIO.output(ledRed, GPIO.LOW)
        return None, None

# Continuous reading of RFID
def continuous_rfid_reading():
    while True:
        read_rfid()
        time.sleep(1)

# Fire detection
def detect_fire():
    current_state_flame = GPIO.input(plamen)
    current_state_smoke = GPIO.input(dim)
    current_temperature = read_temp()

    if current_state_flame == GPIO.HIGH and current_state_smoke == GPIO.LOW and current_temperature > 80:
        return True
    else:
        return False

# Smoke detection
def detect_smoke():
    current_state_smoke = GPIO.input(dim)

    if current_state_smoke == GPIO.LOW:
        return True
    else:
        return False

# Tilt detection
def detect_tilt(start_state_tilt):
    current_state_tilt = GPIO.input(nagib)

    if current_state_tilt != start_state_tilt:
        if current_state_tilt == GPIO.HIGH:
            return True
        else:
            return False
    else:
        if current_state_tilt == GPIO.HIGH:
            return True
        else:
            return False

# Reading data from sensors every 5 seconds
def sensors_reading():
    global ocitanja, latest_rfid
    max_distance = 14.34 # Bin measure

    while True:
        rfid_ocitan.wait()
        print("Sensor readings...")
        current_time = datetime.utcnow().isoformat()+"Z"
        for rfid, naziv in known_rfids.items():
            if rfid in active_rfids:
                if rfid == sensor_rfid:
                    temperatura = read_temp()
                    napunjenost = read_fill_level(max_distance)
                    plamen_i_dim_status = detect_fire()
                    dim_status = detect_smoke()
                    nagib_status = detect_tilt(GPIO.input(nagib))
                    lat, lng = read_gps()

                    ocitanje = {
                        'rfid': sensor_rfid,
                        'naziv': naziv,
                        'lat': lat,
                        'lng': lng,
                        'temperatura': temperatura,
                        'napunjenost': napunjenost,
                        'plamen': plamen_i_dim_status,
                        'polozaj': nagib_status,
                        'baterija': 85,  # Replace with actual battery condition
                        'dim': dim_status,
                        'datetime': current_time,
                        'podrucje': rfid_data['podrucje'].get(rfid, ''),
                        'volumen': rfid_data['volumen'].get(rfid, ''),
                        'vrsta_otpad': rfid_data['vrsta_otpad'].get(rfid, ''),
                    }
                else:
                    ocitanje = {
                        'rfid': rfid,
                        'naziv': known_rfids[rfid],
                        'lat': 0.0,
                        'lng': 0.0,
                        'temperatura': 0.0,
                        'napunjenost': 0.0,
                        'plamen': 0,
                        'polozaj': 0,
                        'baterija': 0,
                        'dim': 0,
                        'datetime': current_time,
                        'podrucje': '',
                        'volumen': 0.0,
                        'vrsta_otpad': ''
                    }
                print(f"\n-----------\n\nNapunjenost: {ocitanje['napunjenost']}%\nPolozaj: {'Prevrnut' if ocitanje['polozaj'] else 'Ispravan'}\nTemperatura: {ocitanje['temperatura']}°C\nPlamen: {'Da' if ocitanje['plamen'] else 'Ne'}\nDim: {'Da' if ocitanje['dim'] else 'Ne'}\nBaterija: {ocitanje['baterija']}\nLokacija: {ocitanje['lat']}, {ocitanje['lng']}")
                ocitanja.append(ocitanje)
                
        time.sleep(5)  # Repeat every 5 seconds
        
# Sending data to server every 15 seconds
def send_data():
    global ocitanja
    while True:
        time.sleep(15)  # Repeat every 15 seconds
        if ocitanja:
            try:
                url = 'YOUR_SERVER_URL'
                for ocitanje in ocitanja:
                    ocitanje['plamen'] = 1 if ocitanje['plamen'] else 0
                    ocitanje['polozaj'] = 1 if ocitanje['polozaj'] else 0
                    ocitanje['dim'] = 1 if ocitanje['dim'] else 0

                response = requests.post(url, json=ocitanja)
                if response.status_code == 200:
                    print("Data sent successfully:", ocitanja)
                    ocitanja = []
                else:
                    print(f"Error sending data: {response.text}")
            except requests.exceptions.RequestException as e:
                print(f"Error sending data: {e}")
            except Exception as e:
                print(f"Unexpected error: {e}")

# Starting a thread to send data and read sensors
threading.Thread(target=send_data, daemon=True).start()
threading.Thread(target=sensors_reading, daemon=True).start()
threading.Thread(target=continuous_rfid_reading, daemon=True).start()


GPIO.output(ledGreen, GPIO.LOW)
GPIO.output(ledRed, GPIO.LOW)
GPIO.output(trig, GPIO.LOW)

try:
    print("System check...")

    # Checking the tilt sensor
    nagib_stanje = GPIO.input(nagib)
    if nagib_stanje is None:
        raise Exception("The tilt sensor does not provide any data.")
    print(f"Tilt sensor is working, current status: {nagib_stanje}")

    # Checking GPS
    try:
        lat, lng = read_gps()
        if lat == 0.0 and lng == 0.0:
            print("The GPS module is working, but still can't get the final coordinates.")
        else:
            print(f"GPS coordinates: Lat {lat}, Lng {lng}")
    except Exception as gps_error:
        raise Exception(f"GPS module error: {gps_error}")
    
    # Checking temperature sensor
    temperatura = read_temp()
    if temperatura is None:
        raise Exception("The temperature sensor does not provide any data.")
    print(f"The temperature sensor is working, the temperature read: {temperatura}°C")

    # Checking flame sensor
    plamen_stanje = GPIO.input(plamen)
    if plamen_stanje is None:
        raise Exception("The flame sensor does not provide any data.")
    print(f"The flame sensor is working, current status: {plamen_stanje}")
    
    # Checking smoke sensor
    dim_stanje = GPIO.input(dim)
    if dim_stanje is None:
        raise Exception("The smoke sensor does not provide any data.")
    print(f"The smoke sensor is working, current status: {dim_stanje}")
    
    # Checking distance sensor
    napunjenost = read_fill_level(14.34)
    if napunjenost < 0 or napunjenost > 100:
        raise Exception("The ultrasonic sensor for measuring the fill level is not working properly.")
    print(f"Ultrasonic sensor works, measured fill level: {napunjenost}%")

    GPIO.output(ledGreen, GPIO.HIGH)
    GPIO.output(ledRed, GPIO.LOW)
    print("The system is ready!")
    
    start_state_tilt = GPIO.input(nagib)

    while True:
        try:
            GPIO.output(ledGreen, GPIO.HIGH)
            GPIO.output(ledRed, GPIO.LOW)
        except Exception as e:
            print("System error: {e}")
            GPIO.output(ledGreen, GPIO.LOW)
            GPIO.output(ledRed, GPIO.HIGH)
            
        time.sleep(1)

except Exception as e:
    print(f"System error: {e}")
    GPIO.output(ledRed, GPIO.HIGH)
    GPIO.output(ledRed, GPIO.LOW)
except KeyboardInterrupt:
    print("Termination of the program by the user.")
finally:
    GPIO.output(ledGreen, GPIO.HIGH)
    time.sleep(1)
    GPIO.output(ledGreen, GPIO.LOW)
    time.sleep(1)
    GPIO.output(ledRed, GPIO.LOW)
    time.sleep(1)
    GPIO.cleanup()
